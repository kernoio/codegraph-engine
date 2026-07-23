/**
 * AdonisJS Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from AdonisJS v5 (`Route.get`) and v6
 * (`router.get` from `@adonisjs/core/services/router`):
 *   - Verb helpers: get/post/put/patch/delete/head/options/any
 *   - router.route(path, methods, handler)
 *   - router.on(path).render / .renderInertia / redirects (GET)
 *   - Nested router.group(() => …).prefix('/api')
 *   - router.resource / shallowResource (+ apiOnly / only / except / params)
 *
 * Path params (`:id`, `:id?`) normalize to `{id}`.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';

const TS_FILE = /\.(m?[jt]sx?|cjs|mts|cts)$/;
const HTTP_VERBS = 'get|post|put|patch|delete|head|options|any';
const RECEIVER = '(?:router|Route)';

type JsLang = 'typescript' | 'javascript';

interface GroupScope {
  start: number;
  end: number;
  prefix: string;
}

interface ResourceAction {
  action: string;
  methods: string[];
  suffix: string;
}

const RESOURCE_ACTIONS: ResourceAction[] = [
  { action: 'index', methods: ['GET'], suffix: '' },
  { action: 'create', methods: ['GET'], suffix: '/create' },
  { action: 'store', methods: ['POST'], suffix: '' },
  { action: 'show', methods: ['GET'], suffix: '/{id}' },
  { action: 'edit', methods: ['GET'], suffix: '/{id}/edit' },
  { action: 'update', methods: ['PUT', 'PATCH'], suffix: '/{id}' },
  { action: 'destroy', methods: ['DELETE'], suffix: '/{id}' },
];

const API_ONLY = new Set(['index', 'store', 'show', 'update', 'destroy']);

export const adonisjsResolver: FrameworkResolver = {
  name: 'adonisjs',
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (
          deps['@adonisjs/core'] ||
          deps['@adonisjs/http-server'] ||
          Object.keys(deps).some((k) => k.startsWith('@adonisjs/'))
        ) {
          return true;
        }
      } catch {
        // fall through
      }
    }

    if (
      context.fileExists('adonisrc.ts') ||
      context.fileExists('adonisrc.js') ||
      context.fileExists('.adonisrc.json') ||
      context.fileExists('ace') ||
      context.fileExists('ace.js')
    ) {
      return true;
    }

    for (const file of context.getAllFiles()) {
      if (!TS_FILE.test(file)) continue;
      const content = context.readFile(file);
      if (content && isAdonisRouteSource(content)) return true;
    }
    return false;
  },

  claimsReference(name: string): boolean {
    return /^[A-Za-z_][\w]*Controller\.\w+$/.test(name);
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    // 'PostsController.show' / PostsController.show
    const dotted = ref.referenceName.match(/^([A-Za-z_][\w]*)\.(\w+)$/);
    if (dotted) {
      const [, className, methodName] = dotted;
      const methods = context
        .getNodesByName(methodName!)
        .filter(
          (n) =>
            (n.kind === 'method' || n.kind === 'function') &&
            (n.qualifiedName?.includes(className!) ||
              n.filePath.toLowerCase().includes(className!.toLowerCase().replace(/controller$/i, '')))
        );
      const target = methods[0];
      if (target) {
        return {
          original: ref,
          targetNodeId: target.id,
          confidence: 0.85,
          resolvedBy: 'framework',
        };
      }
    }

    const name = ref.referenceName.includes('.')
      ? ref.referenceName.slice(ref.referenceName.lastIndexOf('.') + 1)
      : ref.referenceName;
    const candidates = context
      .getNodesByName(name)
      .filter((n) => n.kind === 'function' || n.kind === 'method');
    if (candidates.length === 0) return null;

    const preferred = candidates.filter(
      (n) =>
        n.filePath.includes('/controllers/') ||
        n.filePath.includes('/controller/') ||
        n.filePath.includes('/app/Controllers/')
    );
    const target = preferred[0] ?? candidates[0]!;
    return {
      original: ref,
      targetNodeId: target.id,
      confidence: preferred.length > 0 ? 0.85 : 0.7,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!TS_FILE.test(filePath)) return { nodes: [], references: [] };
    if (!isAdonisRouteSource(content) && !hasAdonisRouteCalls(content)) {
      return { nodes: [], references: [] };
    }
    // Avoid claiming plain Express `router.get` files that lack Adonis signals.
    if (!isAdonisRouteSource(content) && !/\bRoute\.(?:get|post|resource|group)\b/.test(content)) {
      return { nodes: [], references: [] };
    }

    const lang = detectLanguage(filePath);
    const safe = stripCommentsForRegex(content, lang);
    return extractFromSafe(filePath, safe, lang);
  },
};

function extractFromSafe(
  filePath: string,
  safe: string,
  lang: JsLang
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const groups = collectGroupScopes(safe);

  const addRoute = (
    index: number,
    method: string,
    routePath: string,
    matchLen: number,
    handlerName: string | null
  ): void => {
    const line = lineAt(safe, index);
    const path = joinPath(prefixAt(groups, index), normalizeAdonisPath(routePath));
    const node: Node = {
      id: `route:${filePath}:${line}:${method}:${path}`,
      kind: 'route',
      name: `${method} ${path}`,
      qualifiedName: `${filePath}::route:${method}:${path}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: matchLen,
      language: lang,
      updatedAt: now,
    };
    nodes.push(node);

    if (handlerName) {
      references.push({
        fromNodeId: node.id,
        referenceName: handlerName,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: lang,
      });
    }
  };

  // router.get('/x', handler) / Route.post('x', 'Ctrl.method')
  // Also supports multiline: router\n  .get('/x', h)
  const verbRe = new RegExp(
    `\\b${RECEIVER}\\s*\\.\\s*(${HTTP_VERBS})\\s*\\(`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = verbRe.exec(safe)) !== null) {
    const verb = m[1]!;
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close);
    const parts = splitTopLevelArgs(args);
    const pathLit = readStringLiteral((parts[0] ?? '').trim());
    if (pathLit == null) continue;
    const handler = parseHandler((parts[1] ?? '').trim());
    if (verb === 'any') {
      addRoute(m.index, 'ALL', pathLit, m[0].length, handler);
    } else {
      addRoute(m.index, verb.toUpperCase(), pathLit, m[0].length, handler);
    }
  }

  // router.route('/x', ['GET','POST'], handler)
  const routeRe = new RegExp(`\\b${RECEIVER}\\s*\\.\\s*route\\s*\\(`, 'g');
  while ((m = routeRe.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close);
    const parts = splitTopLevelArgs(args);
    const pathLit = readStringLiteral((parts[0] ?? '').trim());
    if (pathLit == null) continue;
    const methods = parseMethodList((parts[1] ?? '').trim());
    const handler = parseHandler((parts[2] ?? '').trim());
    for (const method of methods) {
      addRoute(m.index, method, pathLit, m[0].length, handler);
    }
  }

  // router.on('/').render('home') — GET shorthand
  const onRe = new RegExp(`\\b${RECEIVER}\\s*\\.\\s*on\\s*\\(`, 'g');
  while ((m = onRe.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const pathLit = readStringLiteral(safe.slice(open + 1, close).trim());
    if (pathLit == null) continue;
    const after = safe.slice(close + 1, close + 80);
    if (
      !/\.\s*(?:render|renderInertia|redirectToRoute|redirectToPath)\s*\(/.test(after)
    ) {
      continue;
    }
    addRoute(m.index, 'GET', pathLit, m[0].length, null);
  }

  // router.resource('posts', Ctrl) / shallowResource
  const resourceRe = new RegExp(
    `\\b${RECEIVER}\\s*\\.\\s*(resource|shallowResource)\\s*\\(`,
    'g'
  );
  while ((m = resourceRe.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close);
    const parts = splitTopLevelArgs(args);
    const resourceName = readStringLiteral((parts[0] ?? '').trim());
    if (resourceName == null) continue;
    const controllerExpr = (parts[1] ?? '').trim();
    const chain = readTrailingChain(safe, close + 1);
    const actions = filterResourceActions(chain);
    const paramName = readResourceParam(chain, resourceName);
    // Relative to group prefix — addRoute applies enclosing .prefix() stacks.
    const base = normalizeAdonisPath(resourceName);
    const handlerBase = resourceHandlerBase(controllerExpr);

    for (const action of actions) {
      const suffix = action.suffix.replace('{id}', `{${paramName}}`);
      const fullPath = suffix ? `${base}${suffix}` : base;
      for (const method of action.methods) {
        const handler = handlerBase ? `${handlerBase}.${action.action}` : action.action;
        addRoute(m.index, method, fullPath, m[0].length, handler);
      }
    }
  }

  return { nodes, references };
}

function collectGroupScopes(safe: string): GroupScope[] {
  const scopes: GroupScope[] = [];
  const re = new RegExp(`\\b${RECEIVER}\\s*\\.\\s*group\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close);
    const body = findCallbackBody(args);
    if (!body) continue;
    // Absolute positions of the callback body inside `safe`
    const argsStart = open + 1;
    const bodyStart = argsStart + body.start;
    const bodyEnd = argsStart + body.end;
    const chain = readTrailingChain(safe, close + 1);
    const prefix = readChainStringArg(chain, 'prefix') ?? '';
    scopes.push({ start: bodyStart, end: bodyEnd, prefix: normalizePath(prefix) });
  }
  return scopes;
}

function prefixAt(scopes: GroupScope[], index: number): string {
  const enclosing = scopes
    .filter((s) => index >= s.start && index <= s.end)
    .sort((a, b) => a.start - b.start);
  return enclosing.reduce((acc, s) => joinPath(acc, s.prefix), '');
}

function findCallbackBody(args: string): { start: number; end: number } | null {
  // () => { … } / async () => { … } / function () { … }
  const arrow = args.match(/(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/);
  if (arrow && arrow.index != null) {
    const brace = args.indexOf('{', arrow.index);
    if (brace >= 0) {
      const end = matchDelim(args, brace, '{', '}');
      if (end > brace) return { start: brace, end };
    }
  }
  const fn = args.match(/(?:async\s+)?function\b/);
  if (fn && fn.index != null) {
    const brace = args.indexOf('{', fn.index);
    if (brace >= 0) {
      const end = matchDelim(args, brace, '{', '}');
      if (end > brace) return { start: brace, end };
    }
  }
  return null;
}

/** Read chained `.foo(...).bar(...)` starting at `from` until statement end. */
function readTrailingChain(safe: string, from: number): string {
  let i = from;
  while (i < safe.length && /[ \t]/.test(safe[i]!)) i++;
  // Allow newlines between chain parts
  let end = i;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote: string | null = null;
  let seenDot = false;

  for (; end < safe.length; end++) {
    const ch = safe[end]!;
    if (quote) {
      if (ch === '\\') {
        end++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      if (ch === '.') {
        seenDot = true;
        continue;
      }
      if (ch === ';' || ch === '\n') {
        // newline ends chain only when we're not mid-token after a dangling dot
        if (ch === '\n') {
          // peek ahead: more whitespace + '.' continues the chain
          let j = end + 1;
          while (j < safe.length && /[ \t\n\r]/.test(safe[j]!)) j++;
          if (safe[j] === '.') {
            end = j - 1;
            continue;
          }
          if (!seenDot) break;
          // saw a completed chain call already; newline after ) ends it
          break;
        }
        break;
      }
      // identifier continues after '.'
      if (/[A-Za-z_$0-9]/.test(ch)) continue;
      if (/\s/.test(ch)) continue;
      break;
    }
  }
  return safe.slice(from, end);
}

function readChainStringArg(chain: string, method: string): string | null {
  const re = new RegExp(`\\.\\s*${method}\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`);
  const m = chain.match(re);
  return m ? m[2]! : null;
}

function filterResourceActions(chain: string): ResourceAction[] {
  let actions = RESOURCE_ACTIONS.slice();

  if (/\.\s*apiOnly\s*\(/.test(chain)) {
    actions = actions.filter((a) => API_ONLY.has(a.action));
  }

  const only = readStringArrayArg(chain, 'only');
  if (only) {
    const set = new Set(only);
    actions = actions.filter((a) => set.has(a.action));
  }

  const except = readStringArrayArg(chain, 'except');
  if (except) {
    const set = new Set(except);
    actions = actions.filter((a) => !set.has(a.action));
  }

  return actions;
}

function readStringArrayArg(chain: string, method: string): string[] | null {
  const re = new RegExp(`\\.\\s*${method}\\s*\\(\\s*\\[([^\\]]*)\\]`);
  const m = chain.match(re);
  if (!m) return null;
  return [...m[1]!.matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]!);
}

function readResourceParam(chain: string, resourceName: string): string {
  // .params({ blog: 'slug' }) or .params({ posts: 'postId' })
  const paramsMatch = chain.match(/\.\s*params\s*\(\s*\{([^}]*)\}/);
  if (!paramsMatch) return 'id';
  const body = paramsMatch[1]!;
  // Prefer key matching the last resource segment
  const leaf = resourceName.replace(/^\/+|\/+$/g, '').split('/').pop()!;
  const keyed = body.match(
    new RegExp(`${escapeRegExp(leaf)}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`)
  );
  if (keyed) return keyed[1]!;
  const any = body.match(/:\s*['"`]([^'"`]+)['"`]/);
  return any ? any[1]! : 'id';
}

function resourceHandlerBase(controllerExpr: string): string | null {
  const trimmed = controllerExpr.trim();
  if (!trimmed) return null;
  // controllers.Posts / controllers.Admin.Movies
  const gen = trimmed.match(/^controllers\.([A-Za-z_][\w.]*)$/);
  if (gen) {
    const parts = gen[1]!.split('.');
    const leaf = parts[parts.length - 1]!;
    return leaf.endsWith('Controller') ? leaf : `${leaf}Controller`;
  }
  // PostsController / AdminMoviesController
  if (/^[A-Za-z_][\w]*Controller$/.test(trimmed)) return trimmed;
  // (#controllers/...) lazy import binding used as value
  if (/^[A-Za-z_][\w]*$/.test(trimmed)) {
    return trimmed.endsWith('Controller') ? trimmed : null;
  }
  return null;
}

function parseHandler(expr: string): string | null {
  if (!expr) return null;
  // 'PostsController.show'
  const str = readStringLiteral(expr);
  if (str) {
    if (/^[A-Za-z_][\w]*\.\w+$/.test(str)) return str;
    // bare controller string sometimes used for resource — skip for verb routes
    return str.includes('.') ? str : null;
  }
  // [Controller, 'show'] or [controllers.Posts, 'show']
  if (expr.startsWith('[')) {
    const end = matchDelim(expr, 0, '[', ']');
    if (end < 0) return null;
    const inner = expr.slice(1, end);
    const parts = splitTopLevelArgs(inner);
    const ctrl = (parts[0] ?? '').trim();
    const method = readStringLiteral((parts[1] ?? '').trim());
    const base = resourceHandlerBase(ctrl) ?? ( /^[A-Za-z_][\w]*$/.test(ctrl) ? ctrl : null);
    if (base && method) return `${base}.${method}`;
    if (base && !method) return `${base}.handle`;
    if (method) return method;
    return null;
  }
  // Named function reference
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) return expr;
  // Inline arrow / function — no static handler name
  return null;
}

function parseMethodList(expr: string): string[] {
  const trimmed = expr.trim();
  if (trimmed.startsWith('[')) {
    const end = matchDelim(trimmed, 0, '[', ']');
    if (end < 0) return [];
    return [...trimmed.slice(1, end).matchAll(/['"`]([A-Za-z]+)['"`]/g)].map((x) =>
      x[1]!.toUpperCase()
    );
  }
  const one = readStringLiteral(trimmed);
  return one ? [one.toUpperCase()] : [];
}

function isAdonisRouteSource(source: string): boolean {
  return (
    /@adonisjs\/core\/services\/router/.test(source) ||
    /@adonisjs\/http-server/.test(source) ||
    /@ioc:Adonis\/Core\/Route/.test(source) ||
    /@adonisjs\/core\/http/.test(source) ||
    /from\s+['"]#start\/routes/.test(source)
  );
}

function hasAdonisRouteCalls(source: string): boolean {
  return new RegExp(`\\b${RECEIVER}\\s*\\.\\s*(?:${HTTP_VERBS}|resource|group|route|on)\\s*\\(`).test(
    source
  );
}

function readStringLiteral(expr: string): string | null {
  const m = expr.match(/^(['"`])([^'"`]+)\1/);
  return m ? m[2]! : null;
}

function normalizeAdonisPath(p: string): string {
  let out = p.trim();
  // Param forms: :id, :id?, * → {id}, {*}
  out = out.replace(/:([A-Za-z_][\w]*)\??/g, '{$1}');
  out = out.replace(/\/\*(?=\/|$)/g, '/{*}');
  out = out.replace(/^\*(?=\/|$)/, '{*}');
  return normalizePath(out);
}

function joinPath(prefix: string, routePath: string): string {
  const p = normalizePath(prefix);
  const r = routePath.startsWith('/')
    ? normalizePath(routePath)
    : routePath
      ? normalizePath(`/${routePath}`)
      : '';
  if (!p) return r || '/';
  if (!r || r === '/') return p;
  return `${p}${r.startsWith('/') ? r : `/${r}`}`.replace(/\/{2,}/g, '/');
}

function normalizePath(p: string): string {
  if (!p) return '';
  let out = p.trim();
  if (out && !out.startsWith('/')) out = `/${out}`;
  out = out.replace(/\/{2,}/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function splitTopLevelArgs(args: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

function matchDelim(s: string, open: number, oc: string, cc: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === oc) depth++;
    else if (ch === cc) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineAt(s: string, index: number): number {
  return s.slice(0, index).split('\n').length;
}

function detectLanguage(filePath: string): JsLang {
  if (/\.tsx?$/.test(filePath) || /\.mts$/.test(filePath) || /\.cts$/.test(filePath)) {
    return 'typescript';
  }
  return 'javascript';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
