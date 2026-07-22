/**
 * Akka HTTP / Pekko HTTP Scala routing-DSL extraction.
 *
 * Walks nested `path` / `pathPrefix` / method directives (including `&`
 * conjunctions and `concat` / `~` alternatives) and emits `VERB /path` route
 * nodes. Path matchers like `Segment` / `IntNumber` normalize to `{param}`.
 */

import { Node } from '../../types';
import { UnresolvedRef, FrameworkExtractionResult } from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;
const METHOD_SET = new Set<string>(METHODS);

const MATCHER_PARAM: Record<string, string> = {
  Segment: 'segment',
  Remaining: 'remaining',
  IntNumber: 'id',
  LongNumber: 'id',
  DoubleNumber: 'n',
  JavaUUID: 'uuid',
  Neutral: '',
  Slash: '',
  PathEnd: '',
};

interface Scope {
  /** Brace depth at which this scope was pushed (inclusive of its `{`). */
  depth: number;
  /** Path segments contributed by this scope (absolute accumulation stored on stack top). */
  segments: string[];
  method: string | null;
}

interface PendingRoute {
  method: string;
  path: string;
  line: number;
  handler: string | null;
  index: number;
}

export function extractAkkaHttpRoutes(
  filePath: string,
  content: string
): FrameworkExtractionResult {
  if (!filePath.endsWith('.scala')) return { nodes: [], references: [] };

  // Scala comment syntax matches Java (`//`, `/* */`); keep string offsets stable.
  const safe = stripCommentsForRegex(content, 'java');
  if (!/\b(?:pathPrefix|pathEnd|pathSingleSlash|\bpath\s*\(|\b(?:get|post|put|delete|patch|head|options)\b)/.test(safe)) {
    return { nodes: [], references: [] };
  }

  const pending: PendingRoute[] = [];
  const stack: Scope[] = [{ depth: 0, segments: [], method: null }];
  let depth = 0;
  let i = 0;

  const current = (): Scope => stack[stack.length - 1]!;

  const emit = (method: string, segments: string[], index: number, bodyStart: number, bodyEnd: number) => {
    const path = joinPath(segments);
    const line = lineAt(safe, index);
    const handler = findHandler(safe, bodyStart, bodyEnd);
    pending.push({ method, path, line, handler, index });
  };

  while (i < safe.length) {
    const ch = safe[i]!;

    // Skip string / char literals so path-looking text in strings is ignored.
    if (ch === '"' || ch === "'") {
      i = skipQuoted(safe, i);
      continue;
    }

    if (ch === '{') {
      depth++;
      i++;
      continue;
    }

    if (ch === '}') {
      depth--;
      while (stack.length > 1 && stack[stack.length - 1]!.depth > depth) {
        stack.pop();
      }
      i++;
      continue;
    }

    // Parenthesized conjunction: (get & path(Segment)) { ... }
    if (ch === '(') {
      const conj = tryParseConjunction(safe, i);
      if (conj) {
        const parent = current();
        const method = conj.method ?? parent.method;
        const body = findBlockAfter(safe, conj.end);
        if (body) {
          const named = applyBinderNames(conj.segments, safe, body.start);
          const segments = [...parent.segments, ...named];
          if (method && segments.length > 0) {
            emit(method, segments, conj.index, body.start, body.end);
          }
          stack.push({
            depth: depth + 1,
            segments,
            method,
          });
          // Jump to the `{` so the depth++ branch runs normally.
          i = body.start;
          continue;
        }
        i = conj.end;
        continue;
      }
    }

    const pathPrefix = matchAt(safe, i, /^pathPrefix\s*\(/);
    if (pathPrefix) {
      const argsEnd = matchingParen(safe, i + pathPrefix[0].length - 1);
      if (argsEnd < 0) {
        i++;
        continue;
      }
      const segments = parseMatchers(safe.slice(i + pathPrefix[0].length, argsEnd));
      const body = findBlockAfter(safe, argsEnd + 1);
      if (body) {
        const parent = current();
        const named = applyBinderNames(segments, safe, body.start);
        stack.push({
          depth: depth + 1,
          segments: [...parent.segments, ...named],
          method: parent.method,
        });
        i = body.start;
        continue;
      }
      i = argsEnd + 1;
      continue;
    }

    const pathEnd =
      matchAt(safe, i, /^pathEndOrSingleSlash\b/) ||
      matchAt(safe, i, /^pathEnd\b/) ||
      matchAt(safe, i, /^pathSingleSlash\b/);
    if (pathEnd) {
      const body = findBlockAfter(safe, i + pathEnd[0].length);
      const parent = current();
      if (body) {
        if (parent.method) {
          emit(parent.method, parent.segments, i, body.start, body.end);
        }
        stack.push({
          depth: depth + 1,
          segments: parent.segments.slice(),
          method: parent.method,
        });
        i = body.start;
        continue;
      }
      i += pathEnd[0].length;
      continue;
    }

    // `path(...)` but not pathPrefix / pathEnd*
    const pathDir = matchAt(safe, i, /^path\s*\(/);
    if (pathDir && !safe.slice(Math.max(0, i - 6), i).endsWith('Prefix')) {
      const argsEnd = matchingParen(safe, i + pathDir[0].length - 1);
      if (argsEnd < 0) {
        i++;
        continue;
      }
      const segments = parseMatchers(safe.slice(i + pathDir[0].length, argsEnd));
      const body = findBlockAfter(safe, argsEnd + 1);
      const parent = current();
      if (body) {
        const named = applyBinderNames(segments, safe, body.start);
        const nextSegments = [...parent.segments, ...named];
        if (parent.method) {
          emit(parent.method, nextSegments, i, body.start, body.end);
        }
        stack.push({
          depth: depth + 1,
          segments: nextSegments,
          method: parent.method,
        });
        i = body.start;
        continue;
      }
      i = argsEnd + 1;
      continue;
    }

    const methodMatch = matchAt(safe, i, /^(get|post|put|delete|patch|head|options)\b/);
    if (methodMatch) {
      // Avoid matching identifiers like `getUsers` — require directive form.
      const after = i + methodMatch[0].length;
      const nextNonWs = skipWs(safe, after);
      const nextCh = safe[nextNonWs];
      if (nextCh === '{' || nextCh === '(') {
        const method = methodMatch[1]!.toUpperCase();
        const body = findBlockAfter(safe, after);
        const parent = current();
        if (body) {
          // Emit when path context already exists (path-outer / method-inner).
          // Method-outer (`get { path("x") { … } }`) waits for the nested path.
          if (parent.segments.length > 0) {
            emit(method, parent.segments, i, body.start, body.end);
          }
          stack.push({
            depth: depth + 1,
            segments: parent.segments.slice(),
            method,
          });
          i = body.start;
          continue;
        }
      }
    }

    i++;
  }

  // Deduplicate identical VERB+path (nested pathEnd under already-emitted method).
  const seen = new Set<string>();
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();

  for (const r of pending) {
    if (!r.method || r.path === '') continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const node: Node = {
      id: `route:${filePath}:${r.line}:${r.method}:${r.path}`,
      kind: 'route',
      name: key,
      qualifiedName: `${filePath}::route:${r.method}:${r.path}`,
      filePath,
      startLine: r.line,
      endLine: r.line,
      startColumn: 0,
      endColumn: 0,
      language: 'scala',
      updatedAt: now,
    };
    nodes.push(node);

    if (r.handler) {
      references.push({
        fromNodeId: node.id,
        referenceName: r.handler,
        referenceKind: 'references',
        line: r.line,
        column: 0,
        filePath,
        language: 'scala',
      });
    }
  }

  return { nodes, references };
}

function joinPath(segments: string[]): string {
  if (segments.length === 0) return '/';
  return '/' + segments.filter(Boolean).join('/');
}

/** Prefer `{name}` over `{segment}` when the block binder is `name =>`. */
function applyBinderNames(segments: string[], s: string, bodyStart: number): string[] {
  const binders: string[] = [];
  // `{ name =>` or `{ (name, x) =>` right after the opening brace.
  const head = s.slice(bodyStart, Math.min(s.length, bodyStart + 80));
  const m = head.match(/^\{\s*(?:\(([A-Za-z_][A-Za-z0-9_]*)\s*[,)]|([A-Za-z_][A-Za-z0-9_]*)\s*=>)/);
  if (m) {
    const name = m[1] ?? m[2];
    if (name) binders.push(name);
  }
  if (binders.length === 0) return segments;

  let bi = 0;
  return segments.map((seg) => {
    if (seg === '{segment}' || seg === '{id}' || seg === '{n}' || seg === '{uuid}' || seg === '{remaining}') {
      const b = binders[bi++];
      return b ? `{${b}}` : seg;
    }
    return seg;
  });
}

function parseMatchers(args: string): string[] {
  const segments: string[] = [];
  let i = 0;
  const s = args;

  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch) || ch === '/' || ch === '~' || ch === ',') {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(s, i);
      const lit = s.slice(i + 1, end - 1);
      if (lit) segments.push(lit);
      i = end;
      continue;
    }
    const ident = matchAt(s, i, /^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) {
      const name = ident[0]!;
      if (name in MATCHER_PARAM) {
        const param = MATCHER_PARAM[name]!;
        if (param) segments.push(`{${param}}`);
      }
      // Skip matcher args: IntNumber, Segment.flatMap(...), etc.
      i += name.length;
      i = skipWs(s, i);
      if (s[i] === '(') {
        const end = matchingParen(s, i);
        i = end < 0 ? i + 1 : end + 1;
      } else if (s[i] === '.') {
        // Segment.map / .flatMap — skip dotted calls
        while (s[i] === '.') {
          i++;
          const m = matchAt(s, i, /^[A-Za-z_][A-Za-z0-9_]*/);
          if (!m) break;
          i += m[0].length;
          i = skipWs(s, i);
          if (s[i] === '(') {
            const end = matchingParen(s, i);
            i = end < 0 ? i + 1 : end + 1;
          }
        }
      }
      continue;
    }
    i++;
  }

  return segments;
}

interface Conjunction {
  method: string | null;
  segments: string[];
  end: number;
  index: number;
}

function tryParseConjunction(s: string, openIdx: number): Conjunction | null {
  if (s[openIdx] !== '(') return null;
  const close = matchingParen(s, openIdx);
  if (close < 0) return null;
  const inner = s.slice(openIdx + 1, close);
  // Must look like a directive conjunction (contains & and a method or path).
  if (!inner.includes('&')) return null;
  if (!/\b(?:get|post|put|delete|patch|head|options|pathPrefix|path)\b/.test(inner)) {
    return null;
  }

  let method: string | null = null;
  const segments: string[] = [];

  // Scan parts split by `&` at depth 0.
  const parts = splitTopLevel(inner, '&');
  for (const part of parts) {
    const t = part.trim();
    const meth = t.match(/^(get|post|put|delete|patch|head|options)\b/);
    if (meth && METHOD_SET.has(meth[1]!)) {
      method = meth[1]!.toUpperCase();
      continue;
    }
    const pathM = t.match(/^path(?:Prefix)?\s*\(/);
    if (pathM) {
      const argsOpen = t.indexOf('(');
      const argsClose = matchingParen(t, argsOpen);
      if (argsClose >= 0) {
        segments.push(...parseMatchers(t.slice(argsOpen + 1, argsClose)));
      }
    }
    // entity(...), optional(...), etc. — ignore
  }

  if (!method && segments.length === 0) return null;
  return { method, segments, end: close + 1, index: openIdx };
}

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"' || ch === "'") {
      i = skipQuoted(s, i) - 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0 && ch === sep) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function findBlockAfter(
  s: string,
  from: number
): { start: number; end: number } | null {
  let i = skipWs(s, from);
  // Optional extractor: `{ name =>` or just `{`
  // Also allow `.apply` style / newline before `{`
  // Skip a single identifier binder before `{`? No — binder is inside the block.
  // Some forms: path(Segment) { name => ... }
  if (s[i] !== '{') {
    // Allow `~` chains without immediate block — no block.
    // Also: `pathPrefix("x")(subRoute)` — paren application, skip.
    if (s[i] === '(') {
      return null;
    }
    return null;
  }
  const start = i;
  const end = matchingBrace(s, start);
  if (end < 0) return null;
  return { start, end };
}

const HANDLER_SKIP = new Set([
  'complete',
  'StatusCodes',
  'HttpEntity',
  'HttpResponse',
  'Future',
  'Some',
  'None',
  'OK',
  'Created',
  'BadRequest',
  'NotFound',
  'map',
  'flatMap',
  'recover',
  'foreach',
  'zip',
  'ask',
  'as',
  'entity',
  'parameter',
  'parameters',
  'formFields',
  'onSuccess',
  'rejectEmptyResponse',
  'ToResponseMarshallable',
]);

function findHandler(s: string, bodyStart: number, bodyEnd: number): string | null {
  const body = s.slice(bodyStart, bodyEnd + 1);

  // onSuccess(handler(...)) — common ask-pattern wrapper
  const onSuccess = body.match(/\bonSuccess\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (onSuccess && !HANDLER_SKIP.has(onSuccess[1]!)) {
    return onSuccess[1]!;
  }

  // complete(…) / complete { … } — take the first non-framework call inside.
  const completeAt = body.search(/\bcomplete\b/);
  if (completeAt < 0) return null;
  const after = body.slice(completeAt + 'complete'.length);
  const region = after.slice(0, 200);
  for (const m of region.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = m[1]!;
    if (HANDLER_SKIP.has(name)) continue;
    if (/^[A-Z][A-Z0-9_]+$/.test(name)) continue; // StatusCodes-style constants
    return name;
  }
  return null;
}

function matchAt(s: string, i: number, re: RegExp): RegExpMatchArray | null {
  const m = s.slice(i).match(re);
  return m && m.index === 0 ? m : null;
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return i;
}

function skipQuoted(s: string, i: number): number {
  const quote = s[i]!;
  i++;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    if (s[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function matchingParen(s: string, openIdx: number): number {
  if (s[openIdx] !== '(') return -1;
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"' || ch === "'") {
      i = skipQuoted(s, i) - 1;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingBrace(s: string, openIdx: number): number {
  if (s[openIdx] !== '{') return -1;
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"' || ch === "'") {
      i = skipQuoted(s, i) - 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineAt(s: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < s.length; i++) {
    if (s[i] === '\n') line++;
  }
  return line;
}
