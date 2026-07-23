/**
 * Slim Framework Resolver (Kerno in-repo plugin)
 *
 * Covers Slim 3/4 route registration:
 *   - $app/$group/$this/$self->get|post|put|patch|delete|options|any|head|map
 *   - Nested ->group('/prefix', ...) with cumulative path prefixes
 *   - Handlers: Class::class, 'Class:method', Class::class . ':method', container keys
 *
 * Placeholders are normalized to `{name}` (constraints and optional brackets stripped).
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

const HTTP_VERBS = 'get|post|put|patch|delete|options|head|any';

interface GroupSpan {
  /** Inclusive start index of the group callback body `{` */
  start: number;
  /** Exclusive end index after the matching `}` */
  end: number;
  prefix: string;
}

export const slimResolver: FrameworkResolver = {
  name: 'slim',
  languages: ['php'],

  detect(context: ResolutionContext): boolean {
    const composer = context.readFile('composer.json');
    if (composer) {
      try {
        const pkg = JSON.parse(composer);
        const deps = { ...(pkg.require ?? {}), ...(pkg['require-dev'] ?? {}) };
        if (deps['slim/slim']) return true;
      } catch {
        // fall through
      }
    }

    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.php')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return isSlimSource(content);
    });
  },

  claimsReference(name: string): boolean {
    return /^[A-Za-z_][\w]*@[A-Za-z_]\w*$/.test(name) || /^[A-Z][A-Za-z0-9_]*$/.test(name);
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const at = ref.referenceName.match(/^([A-Za-z_][\w]*)@([A-Za-z_]\w*)$/);
    if (at) {
      const [, className, methodName] = at;
      const target = resolveClassMethod(className!, methodName!, context);
      if (target) {
        return {
          original: ref,
          targetNodeId: target,
          confidence: 0.9,
          resolvedBy: 'framework',
        };
      }
    }

    if (/^[A-Z][A-Za-z0-9_]*$/.test(ref.referenceName)) {
      const candidates = context
        .getNodesByName(ref.referenceName)
        .filter((n) => n.kind === 'class');
      if (candidates.length > 0) {
        const preferred = candidates.filter(
          (n) =>
            /\/(Action|Actions|Handler|Handlers|Controller|Controllers)\//i.test(n.filePath) ||
            /Action|Handler|Controller$/i.test(n.name)
        );
        const target = preferred[0] ?? candidates[0]!;
        return {
          original: ref,
          targetNodeId: target.id,
          confidence: preferred.length > 0 ? 0.85 : 0.7,
          resolvedBy: 'framework',
        };
      }
    }

    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.php')) return { nodes: [], references: [] };
    const safe = stripCommentsForRegex(content, 'php');
    if (!/->(?:group|map|get|post|put|patch|delete|options|head|any)\s*\(/.test(safe)) {
      return { nodes: [], references: [] };
    }

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const groups = collectGroups(safe);
    extractVerbRoutes(filePath, safe, groups, now, nodes, references);
    extractMapRoutes(filePath, safe, groups, now, nodes, references);
    return { nodes, references };
  },
};

function isSlimSource(content: string): boolean {
  return (
    /\buse\s+Slim\\(?:App|Routing\\RouteCollectorProxy|Interfaces\\RouteCollectorProxyInterface)\b/.test(
      content
    ) ||
    /\\Slim\\App\b/.test(content) ||
    /instanceof\s+\\?Slim\\App\b/.test(content) ||
    /\bSlim\\App\b/.test(content)
  );
}

function collectGroups(safe: string): GroupSpan[] {
  const groups: GroupSpan[] = [];
  const groupRe = /->group\s*\(\s*(['"])(.*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = groupRe.exec(safe)) !== null) {
    const prefix = match[2] ?? '';
    const afterCall = match.index + match[0].length;
    const braceOpen = findCallbackBrace(safe, afterCall);
    if (braceOpen < 0) continue;
    const braceClose = findMatchingBrace(safe, braceOpen);
    if (braceClose < 0) continue;
    groups.push({ start: braceOpen, end: braceClose + 1, prefix });
  }
  return groups;
}

/** Find `{` that opens the group/route callback after `->group('…', …`. */
function findCallbackBrace(safe: string, from: number): number {
  let i = from;
  // Skip args until we see `function` / `fn` / `{` (array callable unlikely for group)
  while (i < safe.length) {
    const ch = safe[i]!;
    if (ch === '{') return i;
    if (ch === "'" || ch === '"') {
      i = skipString(safe, i);
      continue;
    }
    if (ch === '(') {
      // nested call — skip balanced parens
      i = skipBalanced(safe, i, '(', ')');
      continue;
    }
    if (ch === ')') {
      // end of group(…) without inline body — look ahead for `{` (unlikely) or give up
      const next = safe.slice(i + 1, i + 40).search(/\{/);
      return next >= 0 ? i + 1 + next : -1;
    }
    i++;
  }
  return -1;
}

function findMatchingBrace(safe: string, openIdx: number): number {
  return skipBalanced(safe, openIdx, '{', '}') - 1;
}

function skipBalanced(safe: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < safe.length; i++) {
    const ch = safe[i]!;
    if (ch === "'" || ch === '"') {
      i = skipString(safe, i) - 1;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function skipString(safe: string, start: number): number {
  const quote = safe[start]!;
  let i = start + 1;
  while (i < safe.length) {
    if (safe[i] === '\\') {
      i += 2;
      continue;
    }
    if (safe[i] === quote) return i + 1;
    i++;
  }
  return safe.length;
}

function prefixAt(groups: GroupSpan[], index: number): string {
  const containing = groups
    .filter((g) => index > g.start && index < g.end)
    .sort((a, b) => a.start - b.start);
  return containing.map((g) => g.prefix).join('');
}

function extractVerbRoutes(
  filePath: string,
  safe: string,
  groups: GroupSpan[],
  now: number,
  nodes: Node[],
  references: UnresolvedRef[]
): void {
  const re = new RegExp(`->(${HTTP_VERBS})\\s*\\(`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(safe)) !== null) {
    const methodRaw = match[1]!.toLowerCase();
    const callOpen = match.index + match[0].length - 1; // '('
    const argsEnd = skipBalanced(safe, callOpen, '(', ')');
    if (argsEnd < 0) continue;
    const args = safe.slice(callOpen + 1, argsEnd - 1);
    const parsed = parsePathAndHandler(args);
    if (!parsed) continue;

    const prefix = prefixAt(groups, match.index);
    const fullPath = joinPaths(prefix, normalizePath(parsed.path));
    const method = methodRaw === 'any' ? 'ANY' : methodRaw.toUpperCase();
    const line = lineAt(safe, match.index);

    const routeNode = makeRouteNode(filePath, line, method, fullPath, match[0].length, now);
    nodes.push(routeNode);
    const handlerName = extractHandler(parsed.handler);
    if (handlerName) {
      references.push(makeRef(routeNode.id, handlerName, line, filePath));
    }
  }
}

function extractMapRoutes(
  filePath: string,
  safe: string,
  groups: GroupSpan[],
  now: number,
  nodes: Node[],
  references: UnresolvedRef[]
): void {
  const re = /->map\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(safe)) !== null) {
    const callOpen = match.index + match[0].length - 1;
    const argsEnd = skipBalanced(safe, callOpen, '(', ')');
    if (argsEnd < 0) continue;
    const args = safe.slice(callOpen + 1, argsEnd - 1);
    const methodsMatch = args.match(/^\s*\[([^\]]*)\]\s*,/);
    if (!methodsMatch) continue;
    const methods = [...methodsMatch[1]!.matchAll(/['"]([A-Za-z]+)['"]/g)].map((m) =>
      m[1]!.toUpperCase()
    );
    if (methods.length === 0) continue;

    const afterMethods = args.slice(methodsMatch[0].length);
    const parsed = parsePathAndHandler(afterMethods);
    if (!parsed) continue;

    const prefix = prefixAt(groups, match.index);
    const fullPath = joinPaths(prefix, normalizePath(parsed.path));
    const line = lineAt(safe, match.index);
    const handlerName = extractHandler(parsed.handler);

    for (const method of methods) {
      const routeNode = makeRouteNode(filePath, line, method, fullPath, match[0].length, now);
      nodes.push(routeNode);
      if (handlerName) {
        references.push(makeRef(routeNode.id, handlerName, line, filePath));
      }
    }
  }
}

function parsePathAndHandler(args: string): { path: string; handler: string } | null {
  const pathMatch = args.match(/^\s*(['"])(.*?)\1\s*,\s*(.*)$/s);
  if (!pathMatch) return null;
  const path = pathMatch[2]!;
  // Reject DI-container / request helpers: $c->get('logger'), $req->getHeader('x').
  // Slim route patterns are '' (group-relative) or start with '/'; and always
  // take a callable/handler as the second argument.
  if (path !== '' && !path.startsWith('/')) return null;
  const handler = pathMatch[3]!.trim();
  if (!handler) return null;
  return { path, handler };
}

function normalizePath(path: string): string {
  let p = path.trim();
  // Optional segments: `[{name}]` / `/books/[{id}]` → unwrap brackets
  p = p.replace(/\[(\{[^{}]+\})\]/g, '$1');
  p = p.replace(/\[([^\]]+)\]/g, '$1');
  // Slim 2 `:id` → `{id}`
  p = p.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
  // Strip FastRoute constraints `{id:[0-9]+}` → `{id}`
  p = p.replace(/\{([A-Za-z_][\w]*):[^}]+\}/g, '{$1}');
  return p;
}

function joinPaths(prefix: string, routePath: string): string {
  if (!routePath) {
    return prefix || '/';
  }
  if (!prefix) {
    return routePath.startsWith('/') ? routePath : `/${routePath}`;
  }
  if (routePath.startsWith('/')) return `${prefix}${routePath}`;
  return `${prefix}/${routePath}`;
}

function extractHandler(expr: string): string | null {
  if (!expr) return null;
  const trimmed = expr.trim();
  if (!trimmed || trimmed.startsWith('function') || trimmed.startsWith('fn ') || trimmed.startsWith('fn(')) {
    return null;
  }

  const short = (s: string) => s.split('\\').pop()!.replace(/^\\/, '');

  // Class::class . ':method' or Class::class.':method'
  const concat = trimmed.match(
    /^([A-Za-z_\\][\w\\]*)::class\s*\.\s*['"]:(\w+)['"]/
  );
  if (concat) return `${short(concat[1]!)}@${concat[2]!}`;

  // 'Namespace\Class:method' or "Class:method"
  const colonStr = trimmed.match(/^['"]([^'"#]+)['"]/);
  if (colonStr) {
    const inner = colonStr[1]!;
    // container key like 'lookup.lasthash' — skip (not a class symbol)
    if (/^[a-z][\w]*\./.test(inner) && !inner.includes('\\') && !inner.includes(':')) {
      return null;
    }
    const colon = inner.lastIndexOf(':');
    if (colon > 0 && !inner.includes('://')) {
      const cls = inner.slice(0, colon);
      const method = inner.slice(colon + 1);
      if (/^[A-Za-z_\\][\w\\]*$/.test(cls) && /^\w+$/.test(method)) {
        return `${short(cls)}@${method}`;
      }
    }
    // bare class string 'MyRestfulController'
    if (/^[A-Za-z_\\][\w\\]*$/.test(inner)) return short(inner);
    return null;
  }

  // Class::class
  const classOnly = trimmed.match(/^([A-Za-z_\\][\w\\]*)::class\b/);
  if (classOnly) return short(classOnly[1]!);

  return null;
}

function makeRouteNode(
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  colLen: number,
  now: number
): Node {
  const path = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return {
    id: `route:${filePath}:${line}:${method}:${path}`,
    kind: 'route',
    name: `${method} ${path}`,
    qualifiedName: `${filePath}::route:${method}:${path}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: colLen,
    language: 'php',
    updatedAt: now,
  };
}

function makeRef(
  fromNodeId: string,
  handlerName: string,
  line: number,
  filePath: string
): UnresolvedRef {
  return {
    fromNodeId,
    referenceName: handlerName,
    referenceKind: 'references',
    line,
    column: 0,
    filePath,
    language: 'php',
  };
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function resolveClassMethod(
  className: string,
  methodName: string,
  context: ResolutionContext
): string | null {
  for (const cls of context.getNodesByName(className)) {
    if (cls.kind !== 'class') continue;
    const methodNode = context
      .getNodesInFile(cls.filePath)
      .find((n) => n.kind === 'method' && n.name === methodName);
    if (methodNode) return methodNode.id;
    return cls.id;
  }
  return null;
}
