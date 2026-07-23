/**
 * Koa (@koa/router / koa-router) Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from:
 *   - shorthand verbs: router.get/post/put/patch/delete/del/head/options/all
 *   - constructor / .prefix() path prefixes
 *   - nested mounts: parent.use('/mount', child.routes())
 *
 * Cross-file mounts are finalized in postExtract.
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
const HTTP_VERBS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'del',
  'head',
  'options',
  'all',
] as const;
const VERB_RE = HTTP_VERBS.join('|');
const KOA_ROUTER_PKG = /['"](?:@koa\/router|koa-router)['"]/;

type JsLang = 'typescript' | 'javascript';

export const koaResolver: FrameworkResolver = {
  name: 'koa',
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@koa/router'] || deps['koa-router']) return true;
        // Bare `koa` alone is not enough — Express-like apps can coexist. Require
        // a router package OR a source import of one below.
        if (deps.koa) {
          for (const file of context.getAllFiles()) {
            if (!TS_FILE.test(file)) continue;
            const content = context.readFile(file);
            if (content && KOA_ROUTER_PKG.test(content)) return true;
          }
        }
      } catch {
        // fall through
      }
    }

    for (const file of context.getAllFiles()) {
      if (!TS_FILE.test(file)) continue;
      const content = context.readFile(file);
      if (!content) continue;
      if (
        KOA_ROUTER_PKG.test(content) &&
        new RegExp(`\\.(?:${VERB_RE})\\s*\\(`).test(content)
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
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
        n.filePath.includes('/handlers/') ||
        n.filePath.includes('/handler/')
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
    if (
      !new RegExp(`\\.(?:${VERB_RE})\\s*\\(`).test(content) &&
      !/\.prefix\s*\(/.test(content) &&
      !/\.use\s*\(/.test(content)
    ) {
      return { nodes: [], references: [] };
    }

    // Avoid claiming plain Express files that happen to use `router.get`.
    if (!isKoaRouterSource(content) && !/\b(?:Router|koa-router|@koa\/router)\b/.test(content)) {
      return { nodes: [], references: [] };
    }

    const lang = detectLanguage(filePath);
    const safe = stripCommentsForRegex(content, lang);
    return extractFromSafe(filePath, safe, lang);
  },

  postExtract(context: ResolutionContext): Node[] {
    const prefixByFile = collectCrossFileMountPrefixes(context);
    if (prefixByFile.size === 0) return [];

    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    const updates: Node[] = [];
    for (const route of routes) {
      if (!route.name.includes(' ')) continue;
      const prefix = prefixForFile(route.filePath, prefixByFile);
      if (!prefix) continue;

      const method = route.name.split(' ')[0]!;
      const qnMatch = route.qualifiedName?.match(/::route:[A-Z]+:(.+)$/);
      const originalPath = qnMatch?.[1] ?? route.name.split(' ').slice(1).join(' ');
      const fullPath = joinPath(prefix, originalPath);
      if (`${method} ${fullPath}` === route.name) continue;

      updates.push({
        ...route,
        name: `${method} ${fullPath}`,
        updatedAt: Date.now(),
      });
    }
    return updates;
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
  const prefixes = collectReceiverPrefixes(safe);
  const mountPrefixes = collectSameFileMountPrefixes(safe, prefixes);

  const addRoute = (
    index: number,
    receiver: string,
    method: string,
    routePath: string,
    matchLen: number,
    handlerName: string | null
  ): void => {
    const line = lineAt(safe, index);
    const receiverPrefix = prefixes.get(receiver) ?? '';
    const mount = mountPrefixes.get(receiver) ?? '';
    const inFilePath = normalizePath(routePath) || routePath;
    const path = joinPath(joinPath(mount, receiverPrefix), routePath);
    const node: Node = {
      id: `route:${filePath}:${line}:${method}:${path}`,
      kind: 'route',
      name: `${method} ${path}`,
      qualifiedName: `${filePath}::route:${method}:${inFilePath}`,
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

  // Named: router.get('/x', h)
  // Multiline start: router\n  .get('/x', h)
  // Chained: …).get('/b', h2)
  const shorthand = new RegExp(
    `(?:\\b([A-Za-z_$][\\w$]*)\\s*\\.(${VERB_RE})\\s*\\(|(?<=\\))\\s*\\.(${VERB_RE})\\s*\\()`,
    'g'
  );
  let m: RegExpExecArray | null;
  let lastReceiver: string | null = null;
  while ((m = shorthand.exec(safe)) !== null) {
    const namedReceiver = m[1];
    const verb = (namedReceiver ? m[2] : m[3])!;
    if (namedReceiver) {
      if (isNoiseReceiver(namedReceiver)) {
        lastReceiver = null;
        continue;
      }
      lastReceiver = namedReceiver;
    } else if (!lastReceiver) {
      continue;
    }
    const receiver = lastReceiver!;

    const open = safe.indexOf('(', m.index + (namedReceiver ? namedReceiver.length : 0));
    if (open < 0) continue;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close);
    const path = parseRoutePathArgs(args);
    if (!path || !looksLikeRoutePath(path)) continue;

    const method = verbToMethod(verb);
    addRoute(m.index, receiver, method, path, close - m.index + 1, extractHandlerName(args));
  }

  return { nodes, references };
}

function isKoaRouterSource(source: string): boolean {
  return (
    KOA_ROUTER_PKG.test(source) ||
    /from\s+['"]koa['"]/.test(source) ||
    /require\s*\(\s*['"]koa['"]\s*\)/.test(source) ||
    /\bnew\s+Router\s*[<(]/.test(source) ||
    /\bRouter\s*\(\s*\{/.test(source)
  );
}

function isNoiseReceiver(name: string): boolean {
  return /^(?:req|res|reply|request|next|console|Math|JSON|Promise|ctx|app)$/.test(name);
}

function verbToMethod(verb: string): string {
  if (verb === 'del') return 'DELETE';
  if (verb === 'all') return 'ALL';
  return verb.toUpperCase();
}

function looksLikeRoutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith('/') || p.startsWith('*') || p.startsWith(':') || p.startsWith('(')) {
    return true;
  }
  // Relative named-route path segments like `about` (kails home.js)
  return /^[A-Za-z0-9._~!$&'()*+,;=:@%{}:-]+$/.test(p) && !p.includes(' ');
}

/**
 * Koa named routes: get(name, path, …) vs get(path, …).
 * When two leading string args exist and the second looks like a URL path,
 * treat the second as the path (first is the route name).
 */
function parseRoutePathArgs(args: string): string | null {
  const parts = splitTopLevelArgs(args)
    .map((p) => p.trim())
    .filter(Boolean);
  const strings: string[] = [];
  for (const part of parts) {
    const lit = matchStringLiteral(part);
    if (lit == null) break;
    strings.push(lit);
  }
  if (strings.length === 0) return null;
  if (
    strings.length >= 2 &&
    (strings[1]!.startsWith('/') ||
      strings[1]!.startsWith(':') ||
      strings[1]!.startsWith('*'))
  ) {
    return strings[1]!;
  }
  return strings[0]!;
}

function matchStringLiteral(expr: string): string | null {
  const m = expr.match(/^(['"`])([^'"`]+)\1/);
  return m ? m[2]! : null;
}

function extractHandlerName(args: string): string | null {
  if (/\bfunction\b/.test(args) || /=>/.test(args)) return null;

  const parts = splitTopLevelArgs(args)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last.startsWith('{') || last.startsWith('[')) return null;
  if (matchStringLiteral(last) != null) return null;
  if (!/^(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)$/.test(last)) return null;
  return last;
}

function collectReceiverPrefixes(safe: string): Map<string, string> {
  const map = new Map<string, string>();

  // const router = new Router({ prefix: '/api' })
  // const router = Router({ prefix: '/api' })
  // const router = require('@koa/router')({ prefix: '/api' })
  const ctor = /(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*)?(?:new\s+)?(?:Router|require\s*\(\s*['"](?:@koa\/router|koa-router)['"]\s*\))\s*(?:<[^>]*>)?\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = ctor.exec(safe)) !== null) {
    const name = m[1];
    const opts = m[2] ?? '';
    const prefix = readObjString(opts, 'prefix');
    if (name && prefix) map.set(name, normalizePath(prefix));
  }

  // router.prefix('/api')
  const prefixCall = /\b([A-Za-z_$][\w$]*)\.prefix\s*\(\s*(['"`])([^'"`]+)\2\s*\)/g;
  while ((m = prefixCall.exec(safe)) !== null) {
    map.set(m[1]!, normalizePath(m[3]!));
  }

  return map;
}

/**
 * Same-file nesting: parent.use('/users', child.routes()) → child inherits
 * parentPrefix + '/users'.
 */
function collectSameFileMountPrefixes(
  safe: string,
  receiverPrefixes: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /\b([A-Za-z_$][\w$]*)\.use\s*\(\s*(['"`])([^'"`]+)\2\s*,\s*([A-Za-z_$][\w$]*)\.routes\s*\(\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const parent = m[1]!;
    const mountPath = m[3]!;
    const child = m[4]!;
    if (parent === child) continue;
    const parentPrefix = receiverPrefixes.get(parent) ?? '';
    const full = joinPath(parentPrefix, mountPath);
    const prev = map.get(child);
    map.set(child, prev ? joinPath(prev, full) : full);
  }
  return map;
}

function collectCrossFileMountPrefixes(context: ResolutionContext): Map<string, string> {
  const map = new Map<string, string>();

  for (const filePath of context.getAllFiles()) {
    if (!TS_FILE.test(filePath)) continue;
    const content = context.readFile(filePath);
    if (!content || !content.includes('.use')) continue;
    const safe = stripCommentsForRegex(content, detectLanguage(filePath));
    const imports = parseLocalImports(safe);
    const prefixes = collectReceiverPrefixes(safe);

    // parent.use('/mount', child.routes())
    const withPath =
      /\b([A-Za-z_$][\w$]*)\.use\s*\(\s*(['"`])([^'"`]+)\2\s*,\s*([A-Za-z_$][\w$]*)\.routes\s*\(\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = withPath.exec(safe)) !== null) {
      const parent = m[1]!;
      const mountPath = m[3]!;
      const childIdent = m[4]!;
      const spec = imports.get(childIdent);
      if (!spec) continue;
      const target = resolveRelModule(filePath, spec);
      const parentPrefix = prefixes.get(parent) ?? '';
      const full = joinPath(parentPrefix, mountPath);
      const key = normalizeFileKey(target);
      const prev = map.get(key);
      map.set(key, prev ? joinPath(prev, full) : full);
    }

    // parent.use(child.routes()) — no extra mount segment; still apply parent prefix
    const bare =
      /\b([A-Za-z_$][\w$]*)\.use\s*\(\s*([A-Za-z_$][\w$]*)\.routes\s*\(\s*\)/g;
    while ((m = bare.exec(safe)) !== null) {
      const parent = m[1]!;
      const childIdent = m[2]!;
      const parentPrefix = prefixes.get(parent);
      if (!parentPrefix) continue;
      const spec = imports.get(childIdent);
      if (!spec) continue;
      const target = resolveRelModule(filePath, spec);
      const key = normalizeFileKey(target);
      const prev = map.get(key);
      map.set(key, prev ? joinPath(prev, parentPrefix) : parentPrefix);
    }
  }
  return map;
}

function parseLocalImports(safe: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of safe.matchAll(/import\s+(\w+)\s+from\s+(['"`])(\.[^'"`]+)\2/g)) {
    map.set(m[1]!, m[3]!);
  }
  for (const m of safe.matchAll(
    /import\s+\{\s*(\w+)\s*\}\s+from\s+(['"`])(\.[^'"`]+)\2/g
  )) {
    map.set(m[1]!, m[3]!);
  }
  for (const m of safe.matchAll(
    /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*(['"`])(\.[^'"`]+)\2\s*\)/g
  )) {
    map.set(m[1]!, m[3]!);
  }
  return map;
}

function resolveRelModule(fromFile: string, spec: string): string {
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
  const joined = dir ? `${dir}/${spec}` : spec;
  const parts: string[] = [];
  for (const seg of joined.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(m?[jt]sx?|cjs)$/, '');
}

function normalizeFileKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/\.(m?[jt]sx?|cjs)$/, '');
}

function prefixForFile(
  filePath: string,
  prefixByFile: Map<string, string>
): string | undefined {
  const key = normalizeFileKey(filePath);
  if (prefixByFile.has(key)) return prefixByFile.get(key);
  for (const [k, v] of prefixByFile) {
    if (normalizeFileKey(k) === key) return v;
  }
  return undefined;
}

function readObjString(obj: string, key: string): string | null {
  const re = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*(['"\`])([^'"\`]+)\\1`, 'm');
  const m = obj.match(re);
  return m ? m[2]! : null;
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

function joinPath(prefix: string, routePath: string): string {
  const p = normalizePath(prefix);
  const r =
    routePath.startsWith('/') || routePath.startsWith('*') || routePath.startsWith(':')
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
  if (out && !out.startsWith('/') && !out.startsWith('*') && !out.startsWith(':')) {
    out = `/${out}`;
  }
  out = out.replace(/\/{2,}/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function lineAt(s: string, index: number): number {
  return s.slice(0, index).split('\n').length;
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

function detectLanguage(filePath: string): JsLang {
  if (/\.tsx?$/.test(filePath) || /\.mts$/.test(filePath) || /\.cts$/.test(filePath)) {
    return 'typescript';
  }
  return 'javascript';
}
