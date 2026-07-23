/**
 * Sanic Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from Sanic app/blueprint registration:
 *   - @app.route / @bp.route (optional methods=[...])
 *   - @app.get/@post/@put/@patch/@delete/@head/@options
 *   - app.add_route(handler, "/path", methods=[...])
 *   - HTTPMethodView via Class.as_view() (verbs inferred from class methods)
 *   - Blueprint(url_prefix=..., version=...) joined onto routes (same-file)
 *   - app.blueprint(bp, url_prefix=...) applied in postExtract
 *
 * Path params `<name>` / `<name:type>` normalize to `{name}`.
 *
 * Known gaps (precision over recall):
 * - Blueprint.group / nested group url_prefix composition across files
 * - Dynamic path construction / non-literal paths
 * - websocket / static file registrations (not HTTP handler endpoints)
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';

const SHORTHAND_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const CBV_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const MANIFEST_FILES = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py'];
const SANIC_IMPORT = /\bfrom\s+sanic\b|\bimport\s+sanic\b/;
/** Route-shaped signals only — bare `.get(` is too common on dicts. */
const SANIC_SIGNAL =
  /\bSanic\s*\(|\bBlueprint\s*\(|@\w+\.route\s*\(|@\w+\.(?:get|post|put|patch|delete|head|options)\s*\(|\.add_route\s*\(/;

export const sanicResolver: FrameworkResolver = {
  name: 'sanic',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    for (const file of MANIFEST_FILES) {
      const content = context.readFile(file);
      if (content && /(^|[\s"'=])sanic([\s"'>=<]|$)/im.test(content)) return true;
    }
    // Nested Python packages / poetry lockfiles mentioning sanic.
    for (const file of context.getAllFiles()) {
      const base = file.split('/').pop() ?? '';
      if (
        (base === 'requirements.txt' ||
          base === 'pyproject.toml' ||
          base === 'Pipfile' ||
          base === 'setup.py') &&
        /(^|[\s"'=])sanic([\s"'>=<]|$)/im.test(context.readFile(file) ?? '')
      ) {
        return true;
      }
    }
    const entrypoints = context
      .getAllFiles()
      .filter((f) => /(?:^|\/)(app|application|main|server|run|__init__)\.py$/.test(f))
      .slice(0, 50);
    for (const f of entrypoints) {
      const c = context.readFile(f);
      if (c && SANIC_IMPORT.test(c) && /\bSanic\s*\(/.test(c)) return true;
    }
    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };
    // Project-level detect() already gated Sanic; per-file we only need a
    // route-shaped signal (`@x.route` / `@x.get` / `.add_route` / Blueprint).
    if (!SANIC_SIGNAL.test(content)) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'python');
    return extractFromSafe(filePath, safe);
  },

  postExtract(context: ResolutionContext): Node[] {
    const regPrefixes = collectBlueprintRegistrationPrefixes(context);
    if (regPrefixes.size === 0) return [];

    const updates: Node[] = [];
    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.py')) continue;
      const content = context.readFile(filePath);
      if (!content || !SANIC_SIGNAL.test(content)) continue;

      const safe = stripCommentsForRegex(content, 'python');
      const hits = collectRouteHits(safe);
      if (hits.length === 0) continue;

      const existing = context.getNodesInFile(filePath).filter((n) => n.kind === 'route');
      for (const hit of hits) {
        if (!hit.receiver) continue;
        const regPrefix = regPrefixes.get(hit.receiver);
        if (!regPrefix) continue;

        for (const method of hit.methods) {
          const line = lineAt(safe, hit.index);
          // Match the pre-registration path (same-file Blueprint prefix already applied).
          const baseName = `${method} ${hit.fullPath}`;
          const node = existing.find(
            (n) => n.startLine === line && (n.name === baseName || n.name.endsWith(` ${hit.routePath}`))
          );
          if (!node) continue;

          const newPath = joinPath(regPrefix, stripLeadingJoin(node.name.replace(/^[A-Z]+\s+/, '')));
          const newName = `${method} ${newPath}`;
          if (node.name === newName) continue;
          updates.push({
            ...node,
            name: newName,
            qualifiedName: `${filePath}::route:${method}:${newPath}`,
            updatedAt: Date.now(),
          });
        }
      }
    }
    return updates;
  },
};

interface BlueprintDef {
  prefix: string;
  version: string | null;
  versionPrefix: string;
}

interface RouteHit {
  index: number;
  end: number;
  receiver: string | null;
  methods: string[];
  routePath: string;
  /** Path after same-file blueprint prefix/version. */
  fullPath: string;
  handler: string | null;
}

function extractFromSafe(filePath: string, safe: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const hits = collectRouteHits(safe);

  for (const hit of hits) {
    const line = lineAt(safe, hit.index);
    for (const method of hit.methods) {
      const node: Node = {
        id: `route:${filePath}:${line}:${method}:${hit.fullPath}`,
        kind: 'route',
        name: `${method} ${hit.fullPath}`,
        qualifiedName: `${filePath}::route:${method}:${hit.fullPath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: hit.end - hit.index,
        language: 'python',
        updatedAt: now,
      };
      nodes.push(node);
      if (hit.handler) {
        references.push({
          fromNodeId: node.id,
          referenceName: hit.handler,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: 'python',
        });
      }
    }
  }

  return { nodes, references };
}

function collectRouteHits(safe: string): RouteHit[] {
  const bpDefs = collectBlueprintDefs(safe);
  const hits: RouteHit[] = [];
  const seen = new Set<string>();

  // @receiver.route("path", ...)
  const routeDec =
    /@(\w+)\.route\s*\(\s*(['"])([^'"]*)\2((?:[^)]|\([^)]*\))*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = routeDec.exec(safe)) !== null) {
    const receiver = m[1]!;
    const rawPath = m[3]!;
    const argsTail = m[4] ?? '';
    const methods = parseMethodsList(argsTail) ?? ['GET'];
    const handler = findHandlerAfter(safe, m.index + m[0].length);
    pushHit(hits, seen, bpDefs, {
      index: m.index,
      end: m.index + m[0].length,
      receiver,
      methods,
      rawPath,
      handler,
    });
  }

  // @receiver.get/post/...("path", ...)
  const shorthand = new RegExp(
    `@(\\w+)\\.(${SHORTHAND_METHODS.join('|')})\\s*\\(\\s*(['"])([^'"]*)\\3`,
    'g'
  );
  while ((m = shorthand.exec(safe)) !== null) {
    const receiver = m[1]!;
    const method = m[2]!.toUpperCase();
    const rawPath = m[4]!;
    const handler = findHandlerAfter(safe, m.index + m[0].length);
    pushHit(hits, seen, bpDefs, {
      index: m.index,
      end: m.index + m[0].length,
      receiver,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // receiver.add_route(handler, "path", methods=[...])
  const addRoute =
    /\b(\w+)\.add_route\s*\(\s*([\w.]+(?:\s*\.\s*as_view\s*\(\s*\))?)\s*,\s*(['"])([^'"]*)\3([^)]*)\)/g;
  while ((m = addRoute.exec(safe)) !== null) {
    const receiver = m[1]!;
    const handlerExpr = m[2]!.replace(/\s+/g, '');
    const rawPath = m[4]!;
    const argsTail = m[5] ?? '';
    let methods = parseMethodsList(argsTail);
    let handler: string | null = null;

    const asView = handlerExpr.match(/^(\w+)\.as_view\(\)$/);
    if (asView) {
      handler = asView[1]!;
      const cbvMethods = inferCbvMethods(safe, handler);
      if (cbvMethods.length > 0) methods = cbvMethods;
      else if (!methods) methods = ['GET'];
    } else {
      handler = handlerExpr.includes('.') ? handlerExpr.split('.').pop()! : handlerExpr;
      if (!methods) methods = ['GET'];
    }

    pushHit(hits, seen, bpDefs, {
      index: m.index,
      end: m.index + m[0].length,
      receiver,
      methods: methods!,
      rawPath,
      handler,
    });
  }

  return hits;
}

function pushHit(
  hits: RouteHit[],
  seen: Set<string>,
  bpDefs: Map<string, BlueprintDef>,
  opts: {
    index: number;
    end: number;
    receiver: string;
    methods: string[];
    rawPath: string;
    handler: string | null;
  }
): void {
  const routePath = normalizePath(opts.rawPath);
  const bp = bpDefs.get(opts.receiver);
  const fullPath = applyBlueprintPrefix(routePath, bp);
  for (const method of opts.methods) {
    const key = `${opts.index}:${method}:${fullPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
  }
  hits.push({
    index: opts.index,
    end: opts.end,
    receiver: opts.receiver,
    methods: opts.methods,
    routePath,
    fullPath,
    handler: opts.handler,
  });
}

function collectBlueprintDefs(safe: string): Map<string, BlueprintDef> {
  const defs = new Map<string, BlueprintDef>();
  // name = Blueprint("...", url_prefix=..., version=..., version_prefix=...)
  const re =
    /\b(\w+)\s*=\s*Blueprint\s*\(\s*(['"])[^'"]*\2([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const varName = m[1]!;
    const args = m[3] ?? '';
    const prefix = parseKwargString(args, 'url_prefix') ?? '';
    const version = parseKwargString(args, 'version') ?? parseKwargNumber(args, 'version');
    const versionPrefix = parseKwargString(args, 'version_prefix') ?? '/v';
    defs.set(varName, {
      prefix: prefix ? normalizePath(prefix) : '',
      version,
      versionPrefix: versionPrefix.startsWith('/') ? versionPrefix : `/${versionPrefix}`,
    });
  }
  return defs;
}

function collectBlueprintRegistrationPrefixes(
  context: ResolutionContext
): Map<string, string> {
  const map = new Map<string, string>();
  for (const filePath of context.getAllFiles()) {
    if (!filePath.endsWith('.py')) continue;
    const content = context.readFile(filePath);
    if (!content || !/\.blueprint\s*\(/.test(content)) continue;
    const safe = stripCommentsForRegex(content, 'python');
    // app.blueprint(bp, url_prefix="/test")  — also Blueprint.group registrations skipped
    const re =
      /\.blueprint\s*\(\s*(\w+)\s*(?:,\s*([^)]*))?\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(safe)) !== null) {
      const varName = m[1]!;
      const args = m[2] ?? '';
      const prefix = parseKwargString(args, 'url_prefix');
      if (prefix) map.set(varName, normalizePath(prefix));
    }
  }
  return map;
}

function applyBlueprintPrefix(routePath: string, bp: BlueprintDef | undefined): string {
  if (!bp) return routePath;
  let prefix = bp.prefix;
  if (bp.version != null && bp.version !== '') {
    const verSeg = `${bp.versionPrefix}${bp.version}`.replace(/\/{2,}/g, '/');
    prefix = joinPath(verSeg, prefix || '/');
  }
  return prefix ? joinPath(prefix, routePath) : routePath;
}

function inferCbvMethods(safe: string, className: string): string[] {
  const classRe = new RegExp(
    `class\\s+${className}\\s*(?:\\([^)]*\\))?\\s*:([\\s\\S]*?)(?=\\nclass\\s+|\\n\\S|$)`
  );
  const bodyMatch = safe.match(classRe);
  if (!bodyMatch) return [];
  const body = bodyMatch[1]!;
  const methods: string[] = [];
  for (const verb of CBV_VERBS) {
    if (new RegExp(`^\\s+(?:async\\s+)?def\\s+${verb}\\s*\\(`, 'm').test(body)) {
      methods.push(verb.toUpperCase());
    }
  }
  return methods;
}

function findHandlerAfter(safe: string, from: number): string | null {
  const tail = safe.slice(from);
  const defMatch = tail.match(/\n\s*(?:async\s+)?def\s+(\w+)/);
  return defMatch ? defMatch[1]! : null;
}

function parseMethodsList(args: string): string[] | null {
  const m = args.match(/methods\s*=\s*(\[[^\]]*\]|\([^)]*\))/);
  if (!m) return null;
  const methods = [...m[1]!.matchAll(/['"]([A-Za-z]+)['"]/g)].map((x) => x[1]!.toUpperCase());
  return methods.length > 0 ? methods : null;
}

function parseKwargString(args: string, name: string): string | null {
  const m = args.match(new RegExp(`${name}\\s*=\\s*['"]([^'"]*)['"]`));
  return m ? m[1]! : null;
}

function parseKwargNumber(args: string, name: string): string | null {
  const m = args.match(new RegExp(`${name}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`));
  return m ? m[1]! : null;
}

/** `<id>` / `<id:int>` / `<id:uuid>` → `{id}` */
function normalizePath(raw: string): string {
  let path = raw.trim() || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/<([A-Za-z_][\w]*)(?::[^>]+)?>/g, '{$1}');
  return path.replace(/\/{2,}/g, '/');
}

function joinPath(prefix: string, sub: string): string {
  const p = prefix === '/' ? '' : prefix.replace(/\/+$/, '');
  const s = !sub || sub === '/' ? '' : sub.startsWith('/') ? sub : `/${sub}`;
  if (!p && !s) return '/';
  if (!p) return s || '/';
  if (!s) return p.startsWith('/') ? p : `/${p}`;
  return `${p.startsWith('/') ? p : `/${p}`}${s}`.replace(/\/{2,}/g, '/');
}

function stripLeadingJoin(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
