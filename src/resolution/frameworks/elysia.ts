/**
 * Elysia Framework Resolver
 *
 * Detects HTTP routes from Elysia's chained API:
 *   - `.get/.post/.put/.patch/.delete/.head/.options/.all(path, handler)`
 *   - `.route(METHOD, path, handler)` for custom verbs
 *   - `.group(prefix, cb)` and `.group(prefix, guard, cb)` with nested prefixes
 *   - `new Elysia({ prefix: '/api' })` instance-level prefixes
 *
 * Path params (`:id`, `:id?`) are normalized to `{id}` for endpoint naming.
 * Non-literal prefixes (e.g. `prefix: WEBROOT`) are left unresolved rather than
 * guessed — precision over recall.
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

type JsLang = 'typescript' | 'javascript' | 'tsx' | 'jsx';

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'] as const;

export const elysiaResolver: FrameworkResolver = {
  name: 'elysia',
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (
          deps.elysia ||
          Object.keys(deps).some((k) => k === 'elysia' || k.startsWith('@elysiajs/'))
        ) {
          return true;
        }
      } catch {
        // Invalid JSON — fall through.
      }
    }

    for (const file of context.getAllFiles()) {
      if (!/\.(m?[jt]sx?|cjs)$/.test(file)) continue;
      const content = context.readFile(file);
      if (!content) continue;
      if (
        /\bfrom\s+['"]elysia['"]/.test(content) ||
        /\brequire\s*\(\s*['"]elysia['"]\s*\)/.test(content) ||
        /\bnew\s+Elysia\s*\(/.test(content)
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const nodes = context.getNodesByName(ref.referenceName);
    const fn = nodes.find((n) => n.kind === 'function' || n.kind === 'method');
    if (!fn) return null;
    return {
      original: ref,
      targetNodeId: fn.id,
      confidence: 0.75,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!/\.(m?[jt]sx?|cjs)$/.test(filePath)) return { nodes: [], references: [] };
    const lang = detectLanguage(filePath);
    const commentLang = lang === 'tsx' || lang === 'typescript' ? 'typescript' : 'javascript';
    const safe = stripCommentsForRegex(content, commentLang);
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    const addRoute = (
      index: number,
      method: string,
      path: string,
      length: number,
      handler: string | null
    ): void => {
      const line = lineAt(safe, index);
      const node: Node = {
        id: `route:${filePath}:${line}:${method}:${path}`,
        kind: 'route',
        name: `${method} ${path}`,
        qualifiedName: `${filePath}::route:${method}:${path}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: length,
        language: lang,
        updatedAt: now,
      };
      nodes.push(node);
      if (handler) {
        references.push({
          fromNodeId: node.id,
          referenceName: handler,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: lang,
        });
      }
    };

    const instances = findElysiaInstances(safe);
    if (instances.length === 0) {
      // No `new Elysia` — still allow chained calls on a pre-bound app variable
      // when the file clearly imports Elysia (e.g. `app.get` after create helper).
      if (/\belysia\b/i.test(safe)) {
        extractInRange(safe, 0, safe.length, '', addRoute);
      }
      return { nodes, references };
    }

    for (const inst of instances) {
      extractInRange(safe, inst.bodyStart, inst.bodyEnd, inst.prefix, addRoute);
    }

    return { nodes, references };
  },
};

// ---------------------------------------------------------------------------
// Instance / group / verb scanning
// ---------------------------------------------------------------------------

interface ElysiaInstance {
  prefix: string;
  bodyStart: number;
  bodyEnd: number;
}

function findElysiaInstances(s: string): ElysiaInstance[] {
  const starts: number[] = [];
  const re = /\bnew\s+Elysia\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) starts.push(m.index);

  const out: ElysiaInstance[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const open = s.indexOf('(', start);
    if (open < 0) continue;
    const close = matchDelim(s, open, '(', ')');
    if (close < 0) continue;
    const prefix = parseConstructorPrefix(s.slice(open + 1, close));
    const bodyStart = close + 1;
    const bodyEnd = i + 1 < starts.length ? starts[i + 1]! : s.length;
    out.push({ prefix, bodyStart, bodyEnd });
  }
  return out;
}

function parseConstructorPrefix(args: string): string {
  // Only accept string-literal prefixes — skip `prefix: WEBROOT` etc.
  const m = args.match(/\bprefix\s*:\s*(['"`])([^'"`]*)\1/);
  return m ? m[2]! : '';
}

type AddRoute = (
  index: number,
  method: string,
  path: string,
  length: number,
  handler: string | null
) => void;

function extractInRange(
  s: string,
  from: number,
  to: number,
  instancePrefix: string,
  addRoute: AddRoute
): void {
  const covered: Array<[number, number]> = [];

  // Groups first so nested verbs are owned by their group callback.
  const groupRe = /\.group\s*\(/g;
  groupRe.lastIndex = from;
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(s)) !== null) {
    if (gm.index >= to) break;
    if (gm.index < from) continue;
    if (isInsideRanges(gm.index, covered)) continue;

    const parsed = parseGroupCall(s, gm.index);
    if (!parsed) continue;
    covered.push([parsed.callStart, parsed.callEnd]);

    const nestedPrefix = joinPaths([instancePrefix, parsed.prefix]);
    // Recurse with empty instance prefix — nestedPrefix already includes it.
    extractInRange(s, parsed.bodyStart, parsed.bodyEnd, nestedPrefix, addRoute);
  }

  // Verb methods not owned by a group in this range.
  const verbRe = new RegExp(
    `\\.(${HTTP_VERBS.join('|')})\\s*\\(\\s*(['\`"])([^'\`"]*)\\2`,
    'g'
  );
  verbRe.lastIndex = from;
  let vm: RegExpExecArray | null;
  while ((vm = verbRe.exec(s)) !== null) {
    if (vm.index >= to) break;
    if (vm.index < from) continue;
    if (isInsideRanges(vm.index, covered)) continue;

    const method = vm[1]!.toUpperCase();
    const rawPath = vm[3]!;
    const path = joinPaths([instancePrefix, rawPath]);
    const handler = namedHandlerAfterPath(s, vm.index + vm[0].length);
    addRoute(vm.index, method, path, vm[0].length, handler);
  }

  // Custom `.route('METHOD', '/path', handler)`.
  const routeRe = /\.route\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]*)\3/g;
  routeRe.lastIndex = from;
  let rm: RegExpExecArray | null;
  while ((rm = routeRe.exec(s)) !== null) {
    if (rm.index >= to) break;
    if (rm.index < from) continue;
    if (isInsideRanges(rm.index, covered)) continue;

    const method = rm[2]!.toUpperCase();
    const path = joinPaths([instancePrefix, rm[4]!]);
    const afterPath = rm.index + rm[0].length;
    const handler = namedHandlerAfterPath(s, afterPath);
    addRoute(rm.index, method, path, rm[0].length, handler);
  }
}

interface GroupCall {
  prefix: string;
  callStart: number;
  callEnd: number;
  bodyStart: number;
  bodyEnd: number;
}

function parseGroupCall(s: string, groupIndex: number): GroupCall | null {
  const open = s.indexOf('(', groupIndex);
  if (open < 0) return null;
  const close = matchDelim(s, open, '(', ')');
  if (close < 0) return null;

  let i = open + 1;
  while (i < close && /\s/.test(s[i]!)) i++;
  const prefixLit = readStringLiteral(s, i);
  if (!prefixLit) return null;
  const prefix = prefixLit.value;
  i = prefixLit.end;
  while (i < close && (/\s/.test(s[i]!) || s[i] === ',')) i++;

  // Optional guard object: `.group('/x', { ... }, cb)`
  if (s[i] === '{') {
    const objEnd = matchDelim(s, i, '{', '}');
    if (objEnd < 0) return null;
    i = objEnd + 1;
    while (i < close && (/\s/.test(s[i]!) || s[i] === ',')) i++;
  }

  // Callback: `(app) => …` or `function (app) {…}` or bare identifier (known gap).
  const arrow = s.slice(i, close).match(/^(?:async\s*)?\([^)]*\)\s*=>\s*/);
  const fn = s.slice(i, close).match(/^function\s*\w*\s*\([^)]*\)\s*/);
  let bodyStart: number;
  let bodyEnd: number;
  if (arrow) {
    bodyStart = i + arrow[0].length;
    if (s[bodyStart] === '{') {
      const braceEnd = matchDelim(s, bodyStart, '{', '}');
      if (braceEnd < 0) return null;
      bodyStart = bodyStart + 1;
      bodyEnd = braceEnd;
    } else {
      bodyEnd = close;
    }
  } else if (fn) {
    bodyStart = i + fn[0].length;
    if (s[bodyStart] !== '{') return null;
    const braceEnd = matchDelim(s, bodyStart, '{', '}');
    if (braceEnd < 0) return null;
    bodyStart = bodyStart + 1;
    bodyEnd = braceEnd;
  } else {
    // `.group('/x', UserRoutes)` — dynamic mount; leave uncovered.
    return null;
  }

  return {
    prefix,
    callStart: groupIndex,
    callEnd: close + 1,
    bodyStart,
    bodyEnd,
  };
}

/**
 * After the path literal of a verb call, skip to the handler argument and
 * return a bare identifier when the handler is a named reference (not inline).
 */
function namedHandlerAfterPath(s: string, afterPathLiteral: number): string | null {
  let i = afterPathLiteral;
  while (i < s.length && /\s/.test(s[i]!)) i++;
  if (s[i] !== ',') return null;
  i++;
  while (i < s.length && /\s/.test(s[i]!)) i++;

  // Inline function / arrow — no named handler.
  const rest = s.slice(i);
  if (/^(?:async\s*)?(?:\(|function\b)/.test(rest)) {
    return null;
  }

  // Identifier or MemberExpression — take the trailing identifier.
  const m = rest.match(/^([A-Za-z_$][\w.$]*)/);
  if (!m) return null;
  const expr = m[1]!;
  const parts = expr.split('.');
  const tail = parts[parts.length - 1]!;
  if (!tail) return null;
  return tail;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function joinPaths(parts: string[]): string {
  let result = '';
  for (const p of parts) {
    if (p == null || p === '') continue;
    let seg = p.trim();
    if (!seg) continue;
    if (!seg.startsWith('/')) seg = `/${seg}`;
    result += seg;
  }
  result = result.replace(/\/{2,}/g, '/');
  if (result.length > 1 && result.endsWith('/')) result = result.slice(0, -1);
  if (!result) result = '/';
  return normalizeParams(result);
}

function normalizeParams(path: string): string {
  // `:id` / `:id?` → `{id}`; leave `{already}` and `*` alone.
  return path.replace(/:([A-Za-z_][\w]*)\??/g, '{$1}');
}

// ---------------------------------------------------------------------------
// Lexical helpers
// ---------------------------------------------------------------------------

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

function readStringLiteral(
  s: string,
  start: number
): { value: string; end: number } | null {
  const q = s[start];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let i = start + 1;
  let value = '';
  while (i < s.length && s[i] !== q) {
    if (s[i] === '\\') {
      i++;
      if (i < s.length) {
        value += s[i];
        i++;
      }
      continue;
    }
    value += s[i];
    i++;
  }
  if (s[i] !== q) return null;
  return { value, end: i + 1 };
}

function isInsideRanges(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([a, b]) => index >= a && index < b);
}

function lineAt(s: string, index: number): number {
  return s.slice(0, index).split('\n').length;
}

function detectLanguage(filePath: string): JsLang {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (/\.tsx?$/.test(filePath)) return 'typescript';
  return 'javascript';
}
