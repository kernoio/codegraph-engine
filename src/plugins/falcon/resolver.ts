/**
 * Falcon Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from `app.add_route(uri_template, resource, …)`
 * (WSGI `falcon.App` / legacy `falcon.API`, and ASGI `falcon.asgi.App`).
 *
 * Falcon maps HTTP verbs via resource responders (`on_get`, `on_post`, …,
 * optionally suffixed: `on_get_image` when `suffix='image'`). Same-file
 * responders are expanded during extract; cross-file resources emit probe
 * routes that postExtract keeps or demotes after scanning the class body.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
type HttpVerb = (typeof HTTP_VERBS)[number];

/** Probe routes carry this marker in qualifiedName so postExtract can refine them. */
const PROBE_QN = '::falcon-probe:';

// Path + resource; optional kwargs. Allows the common multiline form:
//   app.add_route(\n    '/path', resource\n)
const ADD_ROUTE_RE =
  /\.add_route\s*\(\s*(['"])([^'"]+)\1\s*,\s*([^,)\n]+?)(?:\s*,\s*((?:[^()]|\([^)]*\))*?))?\s*\)/g;

const ON_METHOD_RE = /(?:async\s+)?def\s+(on_([a-z]+)(?:_(\w+))?)\s*\(/g;

export const falconResolver: FrameworkResolver = {
  name: 'falcon',
  languages: ['python'],

  detect(context: ResolutionContext): boolean {
    for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg']) {
      const c = context.readFile(f);
      // "falcon" / "falcon==3.1" but not "falconry" or "falcon-mcp".
      if (c && /(^|[\s"'[\[])falcon($|[\s"'=\],;<~>!])/im.test(c)) return true;
    }

    // Fallback: falcon app + add_route in an entrypoint-ish file.
    const candidates = context
      .getAllFiles()
      .filter((f) => f.endsWith('.py'))
      .slice(0, 80);
    for (const f of candidates) {
      const c = context.readFile(f);
      if (!c) continue;
      if (
        /\bimport\s+falcon\b|\bfrom\s+falcon\b/.test(c) &&
        /\.add_route\s*\(/.test(c)
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context.getNodesByName(ref.referenceName);
    if (candidates.length === 0) return null;

    const preferred = candidates.find(
      (n) =>
        (n.kind === 'class' || n.kind === 'method' || n.kind === 'function') &&
        (n.filePath.includes('/resources/') ||
          n.filePath.includes('/api/') ||
          n.filePath.endsWith('.py'))
    );
    const target = preferred ?? candidates.find((n) => n.kind === 'class') ?? candidates[0];
    if (!target) return null;
    return {
      original: ref,
      targetNodeId: target.id,
      confidence: preferred ? 0.85 : 0.7,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };
    if (!content.includes('add_route')) return { nodes: [], references: [] };

    const safe = stripCommentsForRegex(content, 'python');
    const classMethods = collectClassMethods(safe);
    const varToClass = collectVarClassBindings(safe);

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    let match: RegExpExecArray | null;
    ADD_ROUTE_RE.lastIndex = 0;
    while ((match = ADD_ROUTE_RE.exec(safe)) !== null) {
      const path = normalizePath(match[2]!);
      const resourceExpr = match[3]!.trim();
      const kwargs = (match[4] ?? '').trim();
      const suffix = parseSuffix(kwargs);
      const className = resolveResourceClass(resourceExpr, varToClass);
      if (!className) continue;

      const line = lineAt(safe, match.index);
      const methods = methodsForClass(classMethods, className, suffix);
      const verbs: HttpVerb[] =
        methods.length > 0 ? methods : ([...HTTP_VERBS] as HttpVerb[]);
      const isProbe = methods.length === 0;

      for (const verb of verbs) {
        const responder = suffix ? `on_${verb.toLowerCase()}_${suffix}` : `on_${verb.toLowerCase()}`;
        // Use '|' so Falcon typed URI templates (`{id:uuid}`) don't break parsing.
        const qn = isProbe
          ? `${filePath}${PROBE_QN}${className}|${suffix ?? ''}|${verb}|${path}`
          : `${filePath}::route:${verb}:${path}`;
        const routeNode: Node = {
          id: `route:${filePath}:${line}:${verb}:${path}${suffix ? `:${suffix}` : ''}`,
          kind: 'route',
          name: `${verb} ${path}`,
          qualifiedName: qn,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: match[0].length,
          language: 'python',
          updatedAt: now,
        };
        nodes.push(routeNode);

        // Prefer the responder method when known; otherwise the resource class.
        const refName = methods.length > 0 ? responder : className;
        references.push({
          fromNodeId: routeNode.id,
          referenceName: refName,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: 'python',
        });
      }
    }

    return { nodes, references };
  },

  postExtract(context: ResolutionContext): Node[] {
    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    const probes = routes.filter((n) => n.qualifiedName.includes(PROBE_QN));
    if (probes.length === 0) return [];

    const classMethodIndex = buildProjectClassMethods(context);
    const updates: Node[] = [];

    for (const node of probes) {
      const parsed = parseProbeQn(node.qualifiedName);
      if (!parsed) continue;
      const { className, suffix, verb, path } = parsed;
      const methods = methodsForClass(classMethodIndex, className, suffix);
      const hasVerb = methods.includes(verb as HttpVerb);

      if (hasVerb) {
        // Keep as HTTP handler route (name already correct).
        continue;
      }

      // Demote: drop the verb so factory-line http-handler scope ignores it.
      const demoted = path.startsWith('/') ? path : `/${path}`;
      if (node.name === demoted) continue;
      updates.push({
        ...node,
        name: demoted,
        updatedAt: Date.now(),
      });
    }

    return updates;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function parseSuffix(kwargs: string): string | null {
  if (!kwargs) return null;
  const m = kwargs.match(/\bsuffix\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1]! : null;
}

function resolveResourceClass(
  expr: string,
  varToClass: Map<string, string>
): string | null {
  // ClassName(...) or ClassName()
  const call = expr.match(/^([A-Z][A-Za-z0-9_]*)\s*\(/);
  if (call) return call[1]!;

  // bare variable: things
  const bare = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (bare) {
    const name = bare[1]!;
    return varToClass.get(name) ?? (/^[A-Z]/.test(name) ? name : null);
  }

  return null;
}

/** `things = ThingsResource()` / `things = ThingsResource(db)` */
function collectVarClassBindings(safe: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Z][A-Za-z0-9_]*)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    map.set(m[1]!, m[2]!);
  }
  return map;
}

/**
 * Map className → list of { verb, suffix } for each `on_*` responder in `safe`.
 */
function collectClassMethods(safe: string): Map<string, Array<{ verb: HttpVerb; suffix: string | null }>> {
  const map = new Map<string, Array<{ verb: HttpVerb; suffix: string | null }>>();
  const classRe = /^class\s+([A-Z][A-Za-z0-9_]*)\b[^\n]*:/gm;
  const classes: Array<{ name: string; start: number }> = [];
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(safe)) !== null) {
    classes.push({ name: cm[1]!, start: cm.index });
  }

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i]!;
    const end = i + 1 < classes.length ? classes[i + 1]!.start : safe.length;
    const body = safe.slice(cls.start, end);
    const methods: Array<{ verb: HttpVerb; suffix: string | null }> = [];
    ON_METHOD_RE.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = ON_METHOD_RE.exec(body)) !== null) {
      const verb = mm[2]!.toUpperCase() as HttpVerb;
      if (!(HTTP_VERBS as readonly string[]).includes(verb)) continue;
      methods.push({ verb, suffix: mm[3] ?? null });
    }
    if (methods.length > 0) map.set(cls.name, methods);
  }
  return map;
}

function methodsForClass(
  index: Map<string, Array<{ verb: HttpVerb; suffix: string | null }>>,
  className: string,
  routeSuffix: string | null
): HttpVerb[] {
  const entries = index.get(className);
  if (!entries) return [];
  const want = routeSuffix ?? null;
  return entries
    .filter((e) => (e.suffix ?? null) === want)
    .map((e) => e.verb);
}

function buildProjectClassMethods(
  context: ResolutionContext
): Map<string, Array<{ verb: HttpVerb; suffix: string | null }>> {
  const merged = new Map<string, Array<{ verb: HttpVerb; suffix: string | null }>>();
  for (const filePath of context.getAllFiles()) {
    if (!filePath.endsWith('.py')) continue;
    const content = context.readFile(filePath);
    if (!content || !/\bdef\s+on_/.test(content)) continue;
    const safe = stripCommentsForRegex(content, 'python');
    for (const [cls, methods] of collectClassMethods(safe)) {
      const existing = merged.get(cls) ?? [];
      merged.set(cls, existing.concat(methods));
    }
  }
  return merged;
}

function parseProbeQn(
  qn: string
): { className: string; suffix: string | null; verb: string; path: string } | null {
  const idx = qn.indexOf(PROBE_QN);
  if (idx < 0) return null;
  const rest = qn.slice(idx + PROBE_QN.length);
  // className|suffix|VERB|/path  (suffix may be empty; path may contain ':')
  const m = rest.match(/^([^|]+)\|([^|]*)\|([A-Z]+)\|(\/.*)$/);
  if (!m) return null;
  return {
    className: m[1]!,
    suffix: m[2]! || null,
    verb: m[3]!,
    path: m[4]!,
  };
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
