/**
 * Hapi Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from:
 *   - server.route({ method, path, handler })
 *   - server.route([{ … }, { … }]) arrays
 *   - method arrays / '*' catch-all
 *   - handler on the route object or nested under options/config
 *   - register() route prefixes (same-file + cross-file via postExtract)
 *
 * Owns `@hapi/hapi` / `hapi` detection so Express no longer silently claims them.
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

const TS_FILE = /\.(m?[jt]sx?|cjs|mts|cts)$/;
const KNOWN_RECEIVERS = new Set([
  'server',
  'hapi',
  'app',
  'instance',
  'svc',
  'service',
  'api',
]);

type JsLang = 'typescript' | 'javascript';

interface PrefixScope {
  prefix: string;
  start: number;
  end: number;
}

export const hapiResolver: FrameworkResolver = {
  name: 'hapi',
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['@hapi/hapi'] || deps.hapi) return true;
      } catch {
        // fall through
      }
    }

    for (const file of context.getAllFiles()) {
      if (!TS_FILE.test(file)) continue;
      const content = context.readFile(file);
      if (!content) continue;
      if (!isHapiSource(content)) continue;
      if (/\.route\s*\(/.test(content)) return true;
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
    if (!/\.route\s*\(/.test(content) && !/\.register\s*\(/.test(content)) {
      return { nodes: [], references: [] };
    }

    const lang = detectLanguage(filePath);
    const safe = stripCommentsForRegex(content, lang);
    return extractFromSafe(filePath, safe, lang);
  },

  postExtract(context: ResolutionContext): Node[] {
    const prefixByFile = collectCrossFilePrefixes(context);
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
      const qnMatch = route.qualifiedName?.match(/::route:[A-Z*]+:(.+)$/);
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
  const scopes = buildRegisterScopes(safe);
  const fileLooksHapi = isHapiSource(safe);

  const addRoute = (
    index: number,
    method: string,
    routePath: string,
    matchLen: number,
    handlerName: string | null
  ): void => {
    const line = lineAt(safe, index);
    const prefix = prefixAt(scopes, index);
    const inFilePath = normalizePath(routePath) || routePath;
    const path = joinPath(prefix, routePath);
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

  const routeCall = /\b([A-Za-z_$][\w$]*)\.route\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = routeCall.exec(safe)) !== null) {
    const receiver = m[1]!;
    if (!isPlausibleReceiver(receiver, fileLooksHapi, safe, m.index)) continue;

    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const args = safe.slice(open + 1, close).trim();
    const routeObjs = collectRouteObjects(args);
    for (const obj of routeObjs) {
      const path = readObjString(obj, 'path');
      if (!path || !looksLikeRoutePath(path)) continue;
      const methods = readObjMethods(obj);
      if (methods.length === 0) continue;
      const handler = readObjHandler(obj);
      for (const method of methods) {
        addRoute(m.index, method, path, m[0].length, handler);
      }
    }
  }

  return { nodes, references };
}

function collectRouteObjects(args: string): string[] {
  const trimmed = args.trim();
  if (trimmed.startsWith('{')) {
    const end = matchDelim(trimmed, 0, '{', '}');
    if (end < 0) return [];
    return [trimmed.slice(0, end + 1)];
  }
  if (trimmed.startsWith('[')) {
    const end = matchDelim(trimmed, 0, '[', ']');
    if (end < 0) return [];
    const body = trimmed.slice(1, end);
    const objs: string[] = [];
    let i = 0;
    while (i < body.length) {
      while (i < body.length && /[\s,]/.test(body[i]!)) i++;
      if (i >= body.length) break;
      if (body[i] !== '{') break;
      const close = matchDelim(body, i, '{', '}');
      if (close < 0) break;
      objs.push(body.slice(i, close + 1));
      i = close + 1;
    }
    return objs;
  }
  // Variable reference (server.route(Routes)) — cannot resolve statically
  return [];
}

function isHapiSource(source: string): boolean {
  return (
    /from\s+['"]@hapi\/hapi['"]/.test(source) ||
    /from\s+['"]hapi['"]/.test(source) ||
    /require\s*\(\s*['"]@hapi\/hapi['"]\s*\)/.test(source) ||
    /require\s*\(\s*['"]hapi['"]\s*\)/.test(source) ||
    /\bHapi\s*\.\s*server\s*\(/.test(source) ||
    /\bnew\s+Hapi\s*\.\s*Server\s*\(/.test(source) ||
    /\bHapi\.Server\b/.test(source)
  );
}

function isPlausibleReceiver(
  name: string,
  fileLooksHapi: boolean,
  source: string,
  at: number
): boolean {
  if (KNOWN_RECEIVERS.has(name)) return true;
  if (
    /^(?:router|express|fastify|req|res|reply|request|next|console|Math|JSON|Promise)$/.test(
      name
    )
  ) {
    return false;
  }
  if (!fileLooksHapi) {
    // Plugin register callbacks often bind `server` without a top-level hapi import
    if (name === 'server') return true;
    return false;
  }

  if (
    new RegExp(
      `(?:async\\s+)?(?:function\\s+\\w*\\s*)?\\(\\s*${name}\\s*[,)]`
    ).test(source.slice(Math.max(0, at - 500), at))
  ) {
    return true;
  }
  return /^(?:api|http|gateway|application|srv)$/i.test(name);
}

function looksLikeRoutePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith('/')) return true;
  return false;
}

function readObjString(obj: string, key: string): string | null {
  const re = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*(['"\`])([^'"\`]+)\\1`, 'm');
  const m = obj.match(re);
  return m ? m[2]! : null;
}

function readObjMethods(obj: string): string[] {
  const m = obj.match(/(?:^|[,{\s])method\s*:\s*/m);
  if (!m || m.index == null) return [];
  const rest = obj.slice(m.index + m[0].length).trimStart();
  if (rest.startsWith('[')) {
    const end = matchDelim(rest, 0, '[', ']');
    if (end < 0) return [];
    return [...rest.slice(1, end).matchAll(/['"`]([A-Za-z*]+)['"`]/g)].map((x) =>
      normalizeMethod(x[1]!)
    );
  }
  const one = rest.match(/^(['"`])([A-Za-z*]+)\1/);
  return one ? [normalizeMethod(one[2]!)] : [];
}

function normalizeMethod(raw: string): string {
  if (raw === '*') return 'ALL';
  return raw.toUpperCase();
}

function readObjHandler(obj: string): string | null {
  // Top-level handler first, then nested under options/config (legacy hapi).
  const top = readHandlerProp(obj);
  if (top) return top;

  for (const nestKey of ['options', 'config']) {
    const nest = extractNestedObject(obj, nestKey);
    if (!nest) continue;
    const nested = readHandlerProp(nest);
    if (nested) return nested;
  }
  return null;
}

function readHandlerProp(obj: string): string | null {
  const m = obj.match(
    /(?:^|[,{\s])handler\s*:\s*(?:async\s+)?(?:function\b|\(|\{|([A-Za-z_$][\w$.]*))/m
  );
  if (!m) return null;
  if (!m[1]) return null; // inline function / object handler (directory, file, …)
  return m[1];
}

function extractNestedObject(obj: string, key: string): string | null {
  const m = obj.match(new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*\\{`, 'm'));
  if (!m || m.index == null) return null;
  const brace = obj.indexOf('{', m.index + m[0].length - 1);
  if (brace < 0) return null;
  const end = matchDelim(obj, brace, '{', '}');
  if (end < 0) return null;
  return obj.slice(brace, end + 1);
}

function buildRegisterScopes(safe: string): PrefixScope[] {
  const scopes: PrefixScope[] = [];
  const re = /\.register\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const argsStart = open + 1;
    const args = safe.slice(argsStart, close);
    const prefix = extractRegisterPrefix(args);
    if (!prefix) continue;

    const parts = splitTopLevelArgs(args);
    const pluginArg = parts[0] ?? '';
    const pluginAbsStart = argsStart + args.indexOf(pluginArg);
    const body = findFunctionBody(safe, pluginAbsStart, pluginAbsStart + pluginArg.length);
    if (!body) continue;
    scopes.push({ prefix, start: body.start, end: body.end });
  }
  return scopes;
}

function findFunctionBody(
  safe: string,
  from: number,
  to: number
): { start: number; end: number } | null {
  const slice = safe.slice(from, to).trimStart();
  const trimOffset = safe.slice(from, to).length - slice.length;
  const abs = from + trimOffset;

  const fn = slice.match(/^(?:async\s+)?function\b/);
  if (fn) {
    const braceRel = slice.indexOf('{');
    if (braceRel >= 0) {
      const brace = abs + braceRel;
      const end = matchDelim(safe, brace, '{', '}');
      if (end > brace) return { start: brace, end };
    }
  }

  const arrow = slice.match(/^(?:async\s*)?\([^)]*\)\s*=>\s*\{/);
  if (arrow) {
    const brace = abs + arrow[0]!.lastIndexOf('{');
    const end = matchDelim(safe, brace, '{', '}');
    if (end > brace) return { start: brace, end };
  }

  return null;
}

/** Hapi: register(plugin, { routes: { prefix } }) or { plugin, routes: { prefix } }. */
function extractRegisterPrefix(args: string): string | null {
  const nested = args.match(
    /(?:^|,)\s*(?:\{[\s\S]*?)?\broutes\s*:\s*\{[\s\S]*?\bprefix\s*:\s*(['"`])([^'"`]+)\1/
  );
  if (nested) return nested[2]!;
  // Also accept a bare top-level prefix option if present
  const bare = args.match(/(?:^|,)\s*\{[\s\S]*?\bprefix\s*:\s*(['"`])([^'"`]+)\1/);
  return bare ? bare[2]! : null;
}

function prefixAt(scopes: PrefixScope[], index: number): string {
  const enclosing = scopes
    .filter((s) => index >= s.start && index <= s.end)
    .sort((a, b) => a.start - b.start);
  if (enclosing.length === 0) return '';
  return enclosing.reduce((acc, s) => joinPath(acc, s.prefix), '');
}

function collectCrossFilePrefixes(context: ResolutionContext): Map<string, string> {
  const map = new Map<string, string>();

  for (const filePath of context.getAllFiles()) {
    if (!TS_FILE.test(filePath)) continue;
    const content = context.readFile(filePath);
    if (!content || !content.includes('.register')) continue;
    const safe = stripCommentsForRegex(content, detectLanguage(filePath));
    const imports = parseLocalImports(safe);

    const re = /\.register\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(safe)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchDelim(safe, open, '(', ')');
      if (close < 0) continue;
      const args = safe.slice(open + 1, close);
      const prefix = extractRegisterPrefix(args);
      if (!prefix) continue;

      const targets = resolveRegisterTargets(args, filePath, imports);
      for (const target of targets) {
        const normalized = normalizeFileKey(target);
        const prev = map.get(normalized);
        map.set(normalized, prev ? joinPath(prev, prefix) : normalizePath(prefix));
      }
    }
  }
  return map;
}

function resolveRegisterTargets(
  args: string,
  fromFile: string,
  imports: Map<string, string>
): string[] {
  const out: string[] = [];
  const parts = splitTopLevelArgs(args);
  const first = (parts[0] ?? '').trim();

  const pushSpec = (spec: string | null | undefined): void => {
    if (!spec || !spec.startsWith('.')) return;
    out.push(resolveRelModule(fromFile, spec));
  };

  // register(require('./x'), { routes: { prefix } })
  const req = first.match(/^require\s*\(\s*(['"`])(\.[^'"`]+)\1\s*\)$/);
  if (req) {
    pushSpec(req[2]);
    return out;
  }

  // register(ident, opts) where ident is a local import
  const ident = first.match(/^[A-Za-z_$][\w$]*$/);
  if (ident && imports.has(ident[0]!)) {
    pushSpec(imports.get(ident[0]!)!);
    return out;
  }

  // register([{ plugin: require('./x'), routes: { prefix } }, …])
  // or register({ plugin: require('./x'), routes: { prefix } })
  for (const m of args.matchAll(
    /(?:plugin\s*:\s*)?require\s*\(\s*(['"`])(\.[^'"`]+)\1\s*\)/g
  )) {
    pushSpec(m[2]);
  }
  for (const m of args.matchAll(/plugin\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    if (imports.has(m[1]!)) pushSpec(imports.get(m[1]!)!);
  }

  return out;
}

function parseLocalImports(safe: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of safe.matchAll(/import\s+(\w+)\s+from\s+(['"`])(\.[^'"`]+)\2/g)) {
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
  if (out && !out.startsWith('/')) {
    out = `/${out}`;
  }
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
