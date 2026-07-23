/**
 * Sinatra + Grape HTTP route discovery (Kerno in-repo plugin)
 *
 * Sinatra: top-level / Sinatra::Base DSL (`get '/x' do`), nested
 * `namespace` prefixes (sinatra-contrib).
 * Grape: `Grape::API` DSL — verb helpers, `resource`/`namespace`/
 * `route_param`, `prefix`, path `version`, and cross-file `mount`
 * prefixing via postExtract.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';

const HTTP_VERBS = 'get|post|put|patch|delete|options|head|link|unlink';
const OPAQUE_BLOCKS =
  'helpers|params|before|after|configure|rescue_from|given|after_validation|before_validation';
const PREFIX_BLOCKS = 'namespace|resource|resources|group|segment|route_param';

const SINATRA_FILE =
  /Sinatra::(?:Base|Application|Namespace)|require(?:_relative)?\s+['"]sinatra(?:\/[^'"]*)?['"]/;
const GRAPE_FILE = /Grape::API/;

interface ClassScope {
  fqn: string;
  prefix: string;
  version: string;
  mounts: Array<{ target: string; at: string }>;
}

export const sinatraGrapeResolver: FrameworkResolver = {
  name: 'sinatra-grape',
  languages: ['ruby'],

  detect(context: ResolutionContext): boolean {
    const gemfile = context.readFile('Gemfile');
    if (gemfile && (hasGem(gemfile, 'sinatra') || hasGem(gemfile, 'grape'))) {
      return true;
    }
    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.rb')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return SINATRA_FILE.test(content) || GRAPE_FILE.test(content);
    });
  },

  resolve(_ref: UnresolvedRef, _context: ResolutionContext) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.rb')) return { nodes: [], references: [] };
    const safe = stripCommentsForRegex(content, 'ruby');
    if (!SINATRA_FILE.test(safe) && !GRAPE_FILE.test(safe)) {
      return { nodes: [], references: [] };
    }
    return extractFromSafe(filePath, safe);
  },

  postExtract(context: ResolutionContext): Node[] {
    const byFqn = new Map<string, ClassScope>();

    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.rb')) continue;
      const content = context.readFile(filePath);
      if (!content || !GRAPE_FILE.test(content)) continue;
      const safe = stripCommentsForRegex(content, 'ruby');
      for (const scope of collectGrapeClassScopes(safe)) {
        byFqn.set(scope.fqn, scope);
      }
    }

    if (byFqn.size === 0) return [];

    const mountPrefixByClass = buildMountPrefixes(byFqn);
    if (mountPrefixByClass.size === 0) return [];

    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    const updates: Node[] = [];
    const now = Date.now();

    for (const node of routes) {
      const parsed = parseRouteQualifiedName(node.qualifiedName);
      if (!parsed?.apiClass) continue;
      const mountPrefix =
        mountPrefixByClass.get(parsed.apiClass) ??
        mountPrefixByClass.get(bareName(parsed.apiClass));
      if (!mountPrefix) continue;

      const fullPath = joinPath(mountPrefix, parsed.path);
      const newName = `${parsed.method} ${fullPath}`;
      if (node.name === newName) continue;
      updates.push({ ...node, name: newName, updatedAt: now });
    }

    return updates;
  },
};

function hasGem(gemfile: string, name: string): boolean {
  return new RegExp(`gem\\s+['"]${name}['"]`).test(gemfile);
}

function bareName(fqn: string): string {
  const parts = fqn.split('::');
  return parts[parts.length - 1]!;
}

interface PathFrame {
  segment: string;
  depth: number;
}

interface ScopeFrame {
  kind: 'module' | 'class';
  name: string;
  depth: number;
}

function extractFromSafe(filePath: string, safe: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const now = Date.now();
  const masked = maskStringsAndRegex(safe);

  /** Ruby block depth: module/class/def/do/begin/case … end */
  let blockDepth = 0;
  const pathStack: PathFrame[] = [];
  const scopeStack: ScopeFrame[] = [];
  let classPrefix = '';
  let classVersion = '';
  let pendingPath: string | null = null;

  const tokenRe = new RegExp(
    [
      `\\b(module)\\s+([A-Z]\\w*)`,
      `\\b(class)\\s+([A-Z]\\w*)`,
      `\\b(def)\\s+[@\\w]+`,
      `\\b(begin|case)\\b`,
      `\\b(if|unless|while|until|for)\\b`,
      `\\b(prefix)\\s+(:[\\w]+|['"][^'"]+['"])`,
      `\\b(version)\\s+(['"][^'"]+['"])([^\\n]*)`,
      `\\b(${PREFIX_BLOCKS})\\s+(:[\\w]+|['"][^'"]*['"])`,
      `\\b(${OPAQUE_BLOCKS})\\b(?:\\s*\\([^)]*\\))?\\s*(?=do\\b)`,
      `\\b(route)\\s+(\\[.*?\\]|:[\\w]+)\\s*,\\s*(:[\\w]+|['"][^'"]*['"])`,
      `\\b(${HTTP_VERBS})\\b(\\s*(?::[\\w]+|['"][^'"]*['"]))?\\s*(?=do\\b|,|\\(|$)`,
      `\\b(end)\\b`,
      `\\b(do)\\b`,
    ].join('|'),
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(safe)) !== null) {
    if (masked[match.index] === ' ') continue;

    if (match[1] === 'module') {
      blockDepth++;
      scopeStack.push({ kind: 'module', name: match[2]!, depth: blockDepth });
      continue;
    }

    if (match[3] === 'class') {
      blockDepth++;
      scopeStack.push({ kind: 'class', name: match[4]!, depth: blockDepth });
      classPrefix = '';
      classVersion = '';
      continue;
    }

    if (match[5] === 'def' || match[6] === 'begin' || match[6] === 'case') {
      blockDepth++;
      continue;
    }

    if (match[7]) {
      // Block-form if/unless/while/until/for (skip trailing modifiers like `x if y`).
      if (isLineHeadKeyword(safe, match.index)) blockDepth++;
      continue;
    }

    if (match[8] === 'prefix') {
      classPrefix = normalizeSegment(match[9]!);
      continue;
    }

    if (match[10] === 'version') {
      const ver = unquote(match[11]!);
      const rest = match[12] ?? '';
      const skipPath =
        /using:\s*:header/.test(rest) ||
        /using:\s*:param/.test(rest) ||
        /using:\s*:accept_version_header/.test(rest);
      classVersion = skipPath ? '' : normalizeSegment(ver);
      continue;
    }

    if (match[13]) {
      const kind = match[13];
      const raw = match[14]!;
      pendingPath =
        kind === 'route_param' ? normalizeParamSegment(raw) : normalizeSegment(raw);
      continue;
    }

    if (match[15]) {
      // helpers/params/… — `do` increments block depth
      continue;
    }

    if (match[16] === 'route') {
      const methods = parseRouteMethods(match[17]!);
      const routePath = normalizeSegment(match[18]!);
      emitRoutes(
        nodes,
        filePath,
        safe,
        match,
        methods,
        routePath,
        pathStack,
        scopeStack,
        classPrefix,
        classVersion,
        now
      );
      continue;
    }

    if (match[19]) {
      const verb = match[19]!.toUpperCase();
      const pathRaw = (match[20] ?? '').trim();
      const routePath = pathRaw === '' ? '/' : normalizeSegment(pathRaw);
      emitRoutes(
        nodes,
        filePath,
        safe,
        match,
        [verb],
        routePath,
        pathStack,
        scopeStack,
        classPrefix,
        classVersion,
        now
      );
      continue;
    }

    if (match[21] === 'end') {
      while (pathStack.length > 0 && pathStack[pathStack.length - 1]!.depth === blockDepth) {
        pathStack.pop();
      }
      while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1]!.depth === blockDepth) {
        const scope = scopeStack.pop()!;
        if (scope.kind === 'class') {
          classPrefix = '';
          classVersion = '';
        }
      }
      blockDepth = Math.max(0, blockDepth - 1);
      pendingPath = null;
      continue;
    }

    if (match[22] === 'do') {
      blockDepth++;
      if (pendingPath != null) {
        pathStack.push({ segment: pendingPath, depth: blockDepth });
        pendingPath = null;
      }
      continue;
    }
  }

  return { nodes, references: [] };
}

function emitRoutes(
  nodes: Node[],
  filePath: string,
  safe: string,
  match: RegExpExecArray,
  methods: string[],
  routePath: string,
  pathStack: PathFrame[],
  scopeStack: ScopeFrame[],
  classPrefix: string,
  classVersion: string,
  now: number
): void {
  const nested = joinPath(...pathStack.map((f) => f.segment));
  const fullPath = joinPath(classVersion, classPrefix, nested, routePath);
  const line = lineAt(safe, match.index);
  const apiClass = scopeStack.map((s) => s.name).join('::');
  for (const method of methods) {
    nodes.push(makeRouteNode(filePath, line, method, fullPath, match[0].length, now, apiClass));
  }
}

/** True when keyword starts the statement (block form), not a trailing modifier. */
function isLineHeadKeyword(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1;
  const before = content.slice(lineStart, index);
  return before.trim().length === 0;
}
function collectGrapeClassScopes(safe: string): ClassScope[] {
  const scopes: ClassScope[] = [];
  const moduleStack: string[] = [];
  let current: ClassScope | null = null;
  let depth = 0;

  const re =
    /\b(module)\s+([A-Z]\w*)|\b(class)\s+([A-Z]\w*)\s*<\s*Grape::API|\b(prefix)\s+(:[\w]+|['"][^'"]+['"])|\b(version)\s+(['"][^'"]+['"])([^\n]*)|\bmount\s+((?:::)?[A-Z]\w*(?:::[A-Z]\w*)*)([^;\n]*)|\b(end)\b|\b(do)\b/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(safe)) !== null) {
    if (match[1] === 'module') {
      if (!current) moduleStack.push(match[2]!);
      else depth++; // treat nested module inside class as depth (rare)
      continue;
    }
    if (match[3] === 'class') {
      current = {
        fqn: [...moduleStack, match[4]!].join('::'),
        prefix: '',
        version: '',
        mounts: [],
      };
      depth = 1;
      continue;
    }
    if (!current) {
      if (match[12] === 'end' && moduleStack.length) moduleStack.pop();
      continue;
    }

    if (match[5] === 'prefix' && depth === 1) {
      current.prefix = normalizeSegment(match[6]!);
      continue;
    }
    if (match[7] === 'version' && depth === 1) {
      const ver = unquote(match[8]!);
      const rest = match[9] ?? '';
      const skip =
        /using:\s*:header/.test(rest) ||
        /using:\s*:param/.test(rest) ||
        /using:\s*:accept_version_header/.test(rest);
      current.version = skip ? '' : normalizeSegment(ver);
      continue;
    }
    if (match[10] && depth === 1) {
      const target = match[10]!.replace(/^::/, '');
      const rest = match[11] ?? '';
      const atMatch = rest.match(/\b(?:at|under):\s*['"]([^'"]+)['"]/);
      const arrowMatch = rest.match(/=>\s*['"]([^'"]+)['"]/);
      const at = atMatch?.[1] ?? arrowMatch?.[1] ?? '';
      current.mounts.push({ target, at: at ? normalizeSegment(at) : '' });
      continue;
    }
    if (match[13] === 'do') {
      depth++;
      continue;
    }
    if (match[12] === 'end') {
      depth--;
      if (depth === 0) {
        scopes.push(current);
        current = null;
      }
    }
  }

  return scopes;
}

function buildMountPrefixes(byFqn: Map<string, ClassScope>): Map<string, string> {
  const result = new Map<string, string>();

  for (const scope of byFqn.values()) {
    const parentOwn = joinPath(scope.version, scope.prefix);
    for (const m of scope.mounts) {
      const prefix = joinPath(parentOwn, m.at);
      if (!prefix || prefix === '/') continue;
      result.set(m.target, longer(result.get(m.target), prefix));
      result.set(bareName(m.target), longer(result.get(bareName(m.target)), prefix));
    }
  }

  return result;
}

function longer(a: string | undefined, b: string): string {
  if (!a) return b;
  return b.length > a.length ? b : a;
}

function parseRouteQualifiedName(
  qn: string
): { apiClass: string | null; method: string; path: string } | null {
  const m = qn.match(
    /::(?:([A-Z][\w:]*)::)?route:(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|LINK|UNLINK):(\/.*)$/
  );
  if (!m) return null;
  return { apiClass: m[1] ?? null, method: m[2]!, path: m[3]! };
}

function parseRouteMethods(raw: string): string[] {
  if (raw.startsWith('[')) {
    return [...raw.matchAll(/:(\w+)/g)].map((x) => x[1]!.toUpperCase());
  }
  if (raw.startsWith(':')) {
    const name = raw.slice(1).toUpperCase();
    return name === 'ANY'
      ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
      : [name];
  }
  return [raw.toUpperCase()];
}

function normalizeSegment(raw: string): string {
  const t = raw.trim();
  let s: string;
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    // Quoted path — expand :param markers, keep literal segments.
    s = t.slice(1, -1).replace(/:(\w+)\??/g, '{$1}');
  } else if (t.startsWith(':')) {
    // Ruby symbol path segment (:statuses → /statuses).
    s = t.slice(1);
  } else {
    s = t.replace(/:(\w+)\??/g, '{$1}');
  }
  if (!s.startsWith('/')) s = `/${s}`;
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s || '/';
}

function normalizeParamSegment(raw: string): string {
  const t = raw.trim();
  let s =
    (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))
      ? t.slice(1, -1)
      : t;
  if (s.startsWith(':')) s = s.slice(1);
  s = s.replace(/^\//, '');
  return `/{${s}}`;
}

function unquote(raw: string): string {
  const t = raw.trim();
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1);
  }
  if (t.startsWith(':')) return t.slice(1);
  return t;
}

function joinPath(...parts: string[]): string {
  const segs: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    for (const seg of p.split('/')) {
      if (!seg) continue;
      segs.push(seg);
    }
  }
  return '/' + segs.join('/');
}

function makeRouteNode(
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  colLen: number,
  now: number,
  apiClass: string
): Node {
  const path = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const classPart = apiClass ? `${apiClass}::` : '';
  return {
    id: `route:${filePath}:${line}:${method}:${path}`,
    kind: 'route',
    name: `${method} ${path}`,
    qualifiedName: `${filePath}::${classPart}route:${method}:${path}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: colLen,
    language: 'ruby',
    updatedAt: now,
  };
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function maskStringsAndRegex(content: string): string {
  const out = content.split('');
  let i = 0;
  while (i < content.length) {
    const ch = content[i]!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out[i] = ' ';
      i++;
      while (i < content.length) {
        if (content[i] === '\\' && i + 1 < content.length) {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          continue;
        }
        out[i] = ' ';
        if (content[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (content.startsWith('%r', i) && i + 2 < content.length) {
      const delim = content[i + 2]!;
      const closing = pairedDelim(delim);
      out[i] = out[i + 1] = out[i + 2] = ' ';
      i += 3;
      while (i < content.length) {
        out[i] = ' ';
        if (content[i] === closing) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

function pairedDelim(open: string): string {
  switch (open) {
    case '{':
      return '}';
    case '(':
      return ')';
    case '[':
      return ']';
    case '<':
      return '>';
    default:
      return open;
  }
}
