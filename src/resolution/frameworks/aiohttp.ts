/**
 * aiohttp Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from aiohttp.web registration:
 *   - app.router.add_get/post/put/patch/delete/head/options(path, handler)
 *   - app.router.add_route(method, path, handler)
 *   - web.get/post/... / aiohttp.web.get(...) route-table helpers
 *   - @routes.get/post/... RouteTableDef decorators
 *   - web.view(path, Class) / @routes.view(path) (verbs from same-file class methods)
 *   - app.add_subapp('/prefix/', subapp) prefixes (same-file + postExtract)
 *
 * Path params `{name:regex}` normalize to `{name}`.
 *
 * Known gaps (precision over recall):
 * - web.route('*', ...) / add_route('*', ...) wildcard methods
 * - Dynamic / non-literal paths
 * - web.static / add_static (not HTTP handler endpoints)
 * - Class-based views whose class body is in another file (no verb inference)
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
const VIEW_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const MANIFEST_FILES = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py'];

/** Import of the web server surface (not client-only aiohttp). */
const AIOHTTP_WEB_IMPORT =
  /\bfrom\s+aiohttp\s+import\b[\s\S]{0,200}\bweb\b|\bfrom\s+aiohttp\.web\s+import\b|\bimport\s+aiohttp\.web\b|\bimport\s+aiohttp\b/;

/**
 * Route-shaped signals only — bare `aiohttp` appears in many client-only projects.
 * Avoid matching dict `.get(`; require router / RouteTableDef / web helpers.
 */
const AIOHTTP_ROUTE_SIGNAL =
  /\b(?:web|aiohttp\.web)\.(?:Application|RouteTableDef)\s*\(|\.router\.add_(?:get|post|put|patch|delete|head|options|route)\s*\(|\b(?:web|aiohttp\.web)\.(?:get|post|put|patch|delete|head|options|route|view)\s*\(|@\w+\.(?:get|post|put|patch|delete|head|options|route|view)\s*\(|\.add_subapp\s*\(/;

const AIOHTTP_DEP = /(^|[\s"'=\[]|@)aiohttp([\s"'>=<\],]|$)/im;

export const aiohttpResolver: FrameworkResolver = {
  name: 'aiohttp',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    let hasDep = false;
    for (const file of MANIFEST_FILES) {
      const content = context.readFile(file);
      if (content && AIOHTTP_DEP.test(content)) {
        hasDep = true;
        break;
      }
    }
    if (!hasDep) {
      for (const file of context.getAllFiles()) {
        const base = file.split('/').pop() ?? '';
        if (
          (base === 'requirements.txt' ||
            base === 'pyproject.toml' ||
            base === 'Pipfile' ||
            base === 'setup.py') &&
          AIOHTTP_DEP.test(context.readFile(file) ?? '')
        ) {
          hasDep = true;
          break;
        }
      }
    }

    // aiohttp is also a popular HTTP client — only fire when server route
    // registration is visible in the tree.
    const pyFiles = context
      .getAllFiles()
      .filter((f) => f.endsWith('.py'))
      .slice(0, 200);
    for (const f of pyFiles) {
      const c = context.readFile(f);
      if (!c) continue;
      if (AIOHTTP_ROUTE_SIGNAL.test(c) && (hasDep || AIOHTTP_WEB_IMPORT.test(c))) {
        return true;
      }
    }
    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };
    if (!AIOHTTP_ROUTE_SIGNAL.test(content)) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'python');
    return extractFromSafe(filePath, safe);
  },

  postExtract(context: ResolutionContext): Node[] {
    const subPrefixes = collectSubappPrefixes(context);
    if (subPrefixes.size === 0) return [];

    const updates: Node[] = [];
    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.py')) continue;
      const content = context.readFile(filePath);
      if (!content || !AIOHTTP_ROUTE_SIGNAL.test(content)) continue;

      const safe = stripCommentsForRegex(content, 'python');
      const hits = collectRouteHits(safe, { applySubapp: false });
      if (hits.length === 0) continue;

      const existing = context.getNodesInFile(filePath).filter((n) => n.kind === 'route');
      for (const hit of hits) {
        if (!hit.appReceiver) continue;
        const prefix = subPrefixes.get(hit.appReceiver);
        if (!prefix) continue;

        for (const method of hit.methods) {
          const line = lineAt(safe, hit.index);
          const baseName = `${method} ${hit.routePath}`;
          const node = existing.find(
            (n) => n.startLine === line && (n.name === baseName || n.name.endsWith(` ${hit.routePath}`))
          );
          if (!node) continue;

          const newPath = joinPath(prefix, hit.routePath);
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

interface RouteHit {
  index: number;
  end: number;
  /** Application / router owner when known (for add_subapp prefixing). */
  appReceiver: string | null;
  methods: string[];
  routePath: string;
  /** Path after same-file add_subapp prefix. */
  fullPath: string;
  handler: string | null;
}

function extractFromSafe(filePath: string, safe: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const hits = collectRouteHits(safe, { applySubapp: true });

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

function collectRouteHits(
  safe: string,
  opts: { applySubapp: boolean }
): RouteHit[] {
  const subPrefixes = opts.applySubapp ? collectSubappPrefixesInFile(safe) : new Map<string, string>();
  const hits: RouteHit[] = [];
  const seen = new Set<string>();

  // app.router.add_get("/path", handler)  /  router.add_post(...)
  const addVerb = new RegExp(
    `\\b(?:(\\w+)\\.)?router\\.add_(${SHORTHAND_METHODS.join('|')})\\s*\\(\\s*(['"])([^'"]*)\\3\\s*,\\s*([\\w.]+)`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = addVerb.exec(safe)) !== null) {
    const appReceiver = m[1] ?? null;
    const method = m[2]!.toUpperCase();
    const rawPath = m[4]!;
    const handler = handlerLeaf(m[5]!);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // app.router.add_route("GET", "/path", handler)
  const addRoute =
    /\b(?:(\w+)\.)?router\.add_route\s*\(\s*(['"])([A-Za-z]+|\*)\2\s*,\s*(['"])([^'"]*)\4\s*,\s*([\w.]+)/g;
  while ((m = addRoute.exec(safe)) !== null) {
    const methodRaw = m[3]!;
    if (methodRaw === '*') continue; // known gap — wildcard
    const appReceiver = m[1] ?? null;
    const method = methodRaw.toUpperCase();
    const rawPath = m[5]!;
    const handler = handlerLeaf(m[6]!);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // web.get("/path", handler) / aiohttp.web.post(...)
  const webHelper = new RegExp(
    `\\b(?:web|aiohttp\\.web)\\.(${SHORTHAND_METHODS.join('|')})\\s*\\(\\s*(['"])([^'"]*)\\2\\s*,\\s*([\\w.]+)`,
    'g'
  );
  while ((m = webHelper.exec(safe)) !== null) {
    const method = m[1]!.toUpperCase();
    const rawPath = m[3]!;
    const handler = handlerLeaf(m[4]!);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // web.route("GET", "/path", handler) — skip '*'
  const webRoute =
    /\b(?:web|aiohttp\.web)\.route\s*\(\s*(['"])([A-Za-z]+|\*)\1\s*,\s*(['"])([^'"]*)\3\s*,\s*([\w.]+)/g;
  while ((m = webRoute.exec(safe)) !== null) {
    if (m[2] === '*') continue;
    const method = m[2]!.toUpperCase();
    const rawPath = m[4]!;
    const handler = handlerLeaf(m[5]!);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // @routes.get("/path") / @routes.post(...)
  const tableDec = new RegExp(
    `@(\\w+)\\.(${SHORTHAND_METHODS.join('|')})\\s*\\(\\s*(['"])([^'"]*)\\3`,
    'g'
  );
  while ((m = tableDec.exec(safe)) !== null) {
    const method = m[2]!.toUpperCase();
    const rawPath = m[4]!;
    const handler = findHandlerAfter(safe, m.index + m[0].length);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // @routes.route("GET", "/path")
  const tableRoute =
    /@(\w+)\.route\s*\(\s*(['"])([A-Za-z]+|\*)\2\s*,\s*(['"])([^'"]*)\4/g;
  while ((m = tableRoute.exec(safe)) !== null) {
    if (m[3] === '*') continue;
    const method = m[3]!.toUpperCase();
    const rawPath = m[5]!;
    const handler = findHandlerAfter(safe, m.index + m[0].length);
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods: [method],
      rawPath,
      handler,
    });
  }

  // web.view("/path", MyView) / aiohttp.web.view(...)
  const webView =
    /\b(?:web|aiohttp\.web)\.view\s*\(\s*(['"])([^'"]*)\1\s*,\s*(\w+)/g;
  while ((m = webView.exec(safe)) !== null) {
    const rawPath = m[2]!;
    const className = m[3]!;
    const methods = inferViewMethods(safe, className);
    if (methods.length === 0) continue; // other-file class — known gap
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods,
      rawPath,
      handler: className,
    });
  }

  // @routes.view("/path") class MyView
  const tableView = /@(\w+)\.view\s*\(\s*(['"])([^'"]*)\2\s*\)/g;
  while ((m = tableView.exec(safe)) !== null) {
    const rawPath = m[3]!;
    const className = findClassAfter(safe, m.index + m[0].length);
    if (!className) continue;
    const methods = inferViewMethods(safe, className);
    if (methods.length === 0) continue;
    pushHit(hits, seen, subPrefixes, {
      index: m.index,
      end: m.index + m[0].length,
      appReceiver: null,
      methods,
      rawPath,
      handler: className,
    });
  }

  // Associate web.* / aiohttp.web.* helpers inside `app.add_routes([...])`
  // with that Application so same-file add_subapp prefixes apply.
  assignAddRoutesReceivers(safe, hits, subPrefixes);

  return hits;
}

function assignAddRoutesReceivers(
  safe: string,
  hits: RouteHit[],
  subPrefixes: Map<string, string>
): void {
  const re = /\b(\w+)\.add_routes\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const appReceiver = m[1]!;
    const open = m.index + m[0].length - 1;
    const close = findMatchingParen(safe, open);
    if (close < 0) continue;
    for (const hit of hits) {
      if (hit.appReceiver) continue;
      if (hit.index <= open || hit.index >= close) continue;
      hit.appReceiver = appReceiver;
      const prefix = subPrefixes.get(appReceiver);
      if (prefix) {
        hit.fullPath = joinPath(prefix, hit.routePath);
      }
    }
  }
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function pushHit(
  hits: RouteHit[],
  seen: Set<string>,
  subPrefixes: Map<string, string>,
  opts: {
    index: number;
    end: number;
    appReceiver: string | null;
    methods: string[];
    rawPath: string;
    handler: string | null;
  }
): void {
  const routePath = normalizePath(opts.rawPath);
  const prefix =
    opts.appReceiver && subPrefixes.has(opts.appReceiver)
      ? subPrefixes.get(opts.appReceiver)!
      : '';
  const fullPath = prefix ? joinPath(prefix, routePath) : routePath;
  for (const method of opts.methods) {
    const key = `${opts.index}:${method}:${fullPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
  }
  hits.push({
    index: opts.index,
    end: opts.end,
    appReceiver: opts.appReceiver,
    methods: opts.methods,
    routePath,
    fullPath,
    handler: opts.handler,
  });
}

function collectSubappPrefixes(context: ResolutionContext): Map<string, string> {
  const map = new Map<string, string>();
  for (const filePath of context.getAllFiles()) {
    if (!filePath.endsWith('.py')) continue;
    const content = context.readFile(filePath);
    if (!content || !/\.add_subapp\s*\(/.test(content)) continue;
    const safe = stripCommentsForRegex(content, 'python');
    for (const [name, prefix] of collectSubappPrefixesInFile(safe)) {
      map.set(name, prefix);
    }
  }
  return map;
}

function collectSubappPrefixesInFile(safe: string): Map<string, string> {
  const map = new Map<string, string>();
  // app.add_subapp('/admin/', admin)
  const re = /\.add_subapp\s*\(\s*(['"])([^'"]*)\1\s*,\s*(\w+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    map.set(m[3]!, normalizePath(m[2]!));
  }
  return map;
}

function inferViewMethods(safe: string, className: string): string[] {
  const classRe = new RegExp(
    `class\\s+${className}\\s*(?:\\([^)]*\\))?\\s*:([\\s\\S]*?)(?=\\nclass\\s+|\\n\\S|$)`
  );
  const bodyMatch = safe.match(classRe);
  if (!bodyMatch) return [];
  const body = bodyMatch[1]!;
  const methods: string[] = [];
  for (const verb of VIEW_VERBS) {
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

function findClassAfter(safe: string, from: number): string | null {
  const tail = safe.slice(from);
  const classMatch = tail.match(/\n\s*class\s+(\w+)/);
  return classMatch ? classMatch[1]! : null;
}

function handlerLeaf(expr: string): string {
  const cleaned = expr.replace(/\s+/g, '');
  return cleaned.includes('.') ? cleaned.split('.').pop()! : cleaned;
}

/** `{id}` / `{id:\\d+}` → `{id}` */
function normalizePath(raw: string): string {
  let path = raw.trim() || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\{([A-Za-z_][\w]*)(?::[^}]+)?\}/g, '{$1}');
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

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
