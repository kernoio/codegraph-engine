/**
 * http4s Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from the http4s DSL pattern matchers:
 *
 *   HttpRoutes.of[IO] { case GET -> Root / "todos" / LongVar(id) => … }
 *   AuthedRoutes.of { case POST -> Root / "logout" as user => … }
 *   AuthEndpoint partials: case GET -> Root / "findByStatus" :? … asAuthed _ =>
 *
 * Path variables (IntVar/LongVar/UUIDVar/bare binders) normalize to `{name}`.
 * Method concatenation (`GET | POST -> …`) emits one route per verb.
 * Query (`:? …`) and auth (`as` / `asAuthed`) suffixes are ignored for the path.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  FrameworkExtractionResult,
  ResolutionContext,
  UnresolvedRef,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const SCALA_FILE = /\.scala$/i;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const METHOD_ALT = HTTP_METHODS.join('|');

/** `case [binder @] GET [| POST…] -> <path> [:? …] [as|asAuthed …] =>` */
const CASE_ROUTE_RE = new RegExp(
  String.raw`\bcase\s+(?:(?:[A-Za-z_]\w*)\s+@\s+)?((?:${METHOD_ALT})(?:\s*\|\s*(?:${METHOD_ALT}))*)\s*->\s*([^={]+?)\s*=>`,
  'g'
);

const HTTP4S_SIGNAL =
  /org\.http4s|HttpRoutes\.of|AuthedRoutes\.of|Http4sDsl|dsl\.io\.|dsl\.Http4sDsl/;

const BUILD_HTTP4S = /org\.http4s|"http4s-|%%\s*"http4s/;

export const http4sResolver: FrameworkResolver = {
  name: 'http4s',
  languages: ['scala'],

  detect(context: ResolutionContext): boolean {
    for (const manifest of ['build.sbt', 'build.sc', 'Dependencies.scala', 'project/Dependencies.scala']) {
      const content = context.readFile(manifest);
      if (content && BUILD_HTTP4S.test(content)) return true;
    }

    // sbt often pins versions in project/*.scala
    for (const filePath of context.getAllFiles()) {
      if (!/(^|\/)(build\.sbt|build\.sc|Dependencies\.scala|project\/.+\.scala)$/i.test(filePath)) {
        continue;
      }
      const content = context.readFile(filePath);
      if (content && BUILD_HTTP4S.test(content)) return true;
    }

    // Content fallback — only fire when the DSL is clearly present
    for (const filePath of context.getAllFiles()) {
      if (!SCALA_FILE.test(filePath)) continue;
      const content = context.readFile(filePath);
      if (
        content &&
        (content.includes('HttpRoutes.of') ||
          content.includes('AuthedRoutes.of') ||
          /import\s+org\.http4s/.test(content))
      ) {
        return true;
      }
    }

    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!SCALA_FILE.test(filePath)) {
      return { nodes: [], references: [] };
    }
    if (!HTTP4S_SIGNAL.test(content) && !/\b(GET|POST|PUT|PATCH|DELETE)\s*->\s*Root\b/.test(content)) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'java');
    return extractFromSafe(filePath, safe, content);
  },
};

function extractFromSafe(
  filePath: string,
  safe: string,
  original: string
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const seen = new Set<string>();

  CASE_ROUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CASE_ROUTE_RE.exec(safe)) !== null) {
    const methodsRaw = match[1]!;
    const pathRaw = match[2]!;
    const path = parseHttp4sPath(pathRaw);
    if (path == null) continue;

    const line = lineAt(safe, match.index);
    const methods = methodsRaw.split('|').map((m) => m.trim().toUpperCase());
    const handler = enclosingHandlerName(original, match.index);

    for (const method of methods) {
      if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
      const name = `${method} ${path}`;
      const key = `${line}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const routeNode: Node = {
        id: `route:${filePath}:${line}:${method}:${path}`,
        kind: 'route',
        name,
        qualifiedName: `${filePath}::route:${method}:${path}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: 0,
        language: 'scala',
        updatedAt: now,
      };
      nodes.push(routeNode);

      if (handler) {
        references.push({
          fromNodeId: routeNode.id,
          referenceName: handler,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: 'scala',
        });
      }
    }
  }

  return { nodes, references };
}

/**
 * Convert an http4s path matcher into a `/`-style path with `{param}` binders.
 * Returns null when the matcher isn't a static Root/`/:` path shape we understand.
 */
export function parseHttp4sPath(raw: string): string | null {
  // Drop query (`:? …`) and auth (`as` / `asAuthed …`) suffixes
  let s = raw
    .replace(/\s*:\?[\s\S]*$/m, '')
    .replace(/\s+as(?:Authed)?\s+\S+\s*$/m, '')
    .trim();
  if (!s) return null;

  // Collapse whitespace/newlines inside the matcher
  s = s.replace(/\s+/g, ' ').trim();

  // Right-associative `/:` form: `"hello" /: rest` or `"a" /: "b" /: rest`
  if (s.includes('/:')) {
    return parseRightAssociative(s);
  }

  // Left-associative: `Root`, `Root / "x" / LongVar(id)`, …
  if (!/\bRoot\b/.test(s) && !/^"/.test(s)) {
    // Require Root (or a leading string for /:) — skip unrelated `->` matches
    return null;
  }

  const segments: string[] = [];
  // Tokenize: Root | "lit" | IntVar(name) | LongVar(name) | UUIDVar(name) | binder | ~ "ext"
  const tokenRe =
    /\bRoot\b|"((?:\\.|[^"\\])*)"|((?:Int|Long|UUID)Var)\(\s*([A-Za-z_]\w*|_|)\s*\)|~\s*"((?:\\.|[^"\\])*)"|([A-Za-z_]\w*)|\//g;

  let ext: string | null = null;
  let m: RegExpExecArray | null;
  let sawRoot = false;
  while ((m = tokenRe.exec(s)) !== null) {
    if (m[0] === 'Root') {
      sawRoot = true;
      continue;
    }
    if (m[0] === '/') continue;
    if (m[1] != null) {
      segments.push(m[1]);
      continue;
    }
    if (m[2] != null) {
      const varName = m[3] && m[3] !== '_' ? m[3] : guessParamName(m[2]);
      segments.push(`{${varName}}`);
      continue;
    }
    if (m[4] != null) {
      ext = m[4];
      continue;
    }
    if (m[5] != null) {
      // Bare binder (e.g. `name`, `modelName`) — path param
      if (m[5] === 'Root') {
        sawRoot = true;
        continue;
      }
      segments.push(`{${m[5]}}`);
    }
  }

  if (!sawRoot && segments.length === 0) return null;

  let path = '/' + segments.join('/');
  if (path === '/') {
    // ok — GET /
  } else {
    path = path.replace(/\/+/g, '/');
  }

  if (ext != null && segments.length > 0) {
    path = path + '.' + ext;
  } else if (ext != null) {
    path = '/{file}.' + ext;
  }

  return path;
}

function parseRightAssociative(s: string): string | null {
  // `"hello" /: rest` → `/hello/{*rest}`; `"a" /: "b" /: rest` → `/a/b/{*rest}`
  const parts = s.split(/\s*\/:\s*/);
  if (parts.length < 2) return null;
  const segments: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!.trim();
    const lit = part.match(/^"((?:\\.|[^"\\])*)"$/);
    if (lit) {
      segments.push(lit[1]!);
      continue;
    }
    if (i === parts.length - 1 && /^[A-Za-z_]\w*$/.test(part)) {
      segments.push(`{*${part}}`);
      continue;
    }
    // Nested left-associative fragment after /: is rare; bail rather than guess
    return null;
  }
  return '/' + segments.join('/');
}

function guessParamName(extractor: string): string {
  if (extractor === 'UUIDVar') return 'uuid';
  if (extractor === 'LongVar' || extractor === 'IntVar') return 'id';
  return 'param';
}

/** Nearest enclosing `def`/`val` name before `index` — best-effort handler link. */
function enclosingHandlerName(source: string, index: number): string | null {
  const before = source.slice(0, index);
  const defRe = /\b(?:def|val)\s+([A-Za-z_]\w*)\b/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = defRe.exec(before)) !== null) {
    last = m[1]!;
  }
  return last;
}

function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === '\n') line++;
  }
  return line;
}
