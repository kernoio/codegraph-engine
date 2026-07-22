/**
 * FastEndpoints Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from FastEndpoints endpoint classes:
 *   - Configure() shorthand: Get/Post/Put/Patch/Delete("path", ...)
 *   - Verbs(Http.X, ...) + Routes("path", ...) cartesian product
 *   - Class attributes: [HttpGet("path")], [HttpPost("path")], …
 *   - Group<T>() / SubGroup prefixes via postExtract
 *   - Version(n) suffix when n > 0 (default "v" prefix, appended)
 *
 * Stock aspnet covers MVC controllers + Minimal APIs; this plugin owns the
 * FastEndpoints Configure()/Endpoint<> model (and FE attribute endpoints so
 * Group prefixes can be applied).
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

const SHORTHAND_VERBS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;
const ATTR_VERBS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'] as const;

const SHORTHAND_RE = new RegExp(
  `\\b(${SHORTHAND_VERBS.join('|')})\\s*\\(\\s*((?:(?:"[^"]*"|'[^']*')\\s*,\\s*)*(?:"[^"]*"|'[^']*'))\\s*\\)`,
  'g'
);

const VERBS_CALL_RE = /\bVerbs\s*\(\s*([^)]*)\)/;
const ROUTES_CALL_RE = /\bRoutes\s*\(\s*((?:(?:"[^"]*"|'[^']*')\s*,\s*)*(?:"[^"]*"|'[^']*'))\s*\)/;
const GROUP_CALL_RE = /\bGroup\s*<\s*([A-Za-z_][A-Za-z0-9_]*)\s*>\s*\(\s*\)/;
const VERSION_CALL_RE = /\bVersion\s*\(\s*(\d+)\s*(?:,|\))/;
const ATTR_RE = new RegExp(
  `\\[Http(${ATTR_VERBS.join('|')})\\s*\\(\\s*["']([^"']*)["']`,
  'g'
);

const ENDPOINT_BASE_RE =
  /:\s*(?:Endpoint(?:WithoutRequest)?(?:\s*<[^;{]+>)?|Ep\.(?:Req|NoReq)\.[A-Za-z.]+)/;

const GROUP_CLASS_RE =
  /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:SubGroup\s*<\s*([A-Za-z_][A-Za-z0-9_]*)\s*>|Group)\b/g;
const GROUP_CONFIGURE_RE =
  /(?:base\.)?Configure\s*\(\s*["']([^"']*)["']/;

export const fastEndpointsResolver: FrameworkResolver = {
  name: 'fastendpoints',
  languages: ['csharp'],

  detect(context: ResolutionContext): boolean {
    for (const file of context.getAllFiles()) {
      if (!file.endsWith('.csproj')) continue;
      const content = context.readFile(file);
      if (
        content &&
        (/PackageReference\s+Include\s*=\s*"FastEndpoints"/i.test(content) ||
          content.includes('FastEndpoints'))
      ) {
        return true;
      }
    }

    for (const file of context.getAllFiles()) {
      if (!file.endsWith('.cs')) continue;
      const content = context.readFile(file);
      if (!content) continue;
      if (
        /\bAddFastEndpoints\s*\(/.test(content) ||
        /\bUseFastEndpoints\s*\(/.test(content) ||
        (/\busing\s+FastEndpoints\b/.test(content) && ENDPOINT_BASE_RE.test(content))
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context
      .getNodesByName(ref.referenceName)
      .filter((n) => n.kind === 'class' || n.kind === 'method');
    if (candidates.length === 0) return null;
    const preferred =
      candidates.find((n) => n.filePath === ref.filePath && n.kind === 'class') ??
      candidates.find((n) => n.filePath === ref.filePath) ??
      candidates.find((n) => n.kind === 'class') ??
      candidates[0]!;
    return {
      original: ref,
      targetNodeId: preferred.id,
      confidence: preferred.filePath === ref.filePath ? 0.9 : 0.75,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.cs')) return { nodes: [], references: [] };
    if (
      !ENDPOINT_BASE_RE.test(content) &&
      !/\bConfigure\s*\(\s*\)/.test(content) &&
      !/\[Http(?:Get|Post|Put|Patch|Delete|Head|Options)\b/.test(content)
    ) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'csharp');
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    for (const cls of findEndpointClasses(safe)) {
      const localRoutes: Array<{ method: string; path: string; index: number; length: number }> =
        [];

      // Configure() body: shorthand Get/Post/… and Verbs+Routes
      if (cls.configureBody) {
        const body = cls.configureBody;
        SHORTHAND_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = SHORTHAND_RE.exec(body)) !== null) {
          const method = m[1]!.toUpperCase();
          for (const path of parseStringArgs(m[2]!)) {
            localRoutes.push({
              method,
              path: normalizePath(path),
              index: cls.configureStart + m.index,
              length: m[0].length,
            });
          }
        }

        const verbsMatch = VERBS_CALL_RE.exec(body);
        const routesMatch = ROUTES_CALL_RE.exec(body);
        if (verbsMatch && routesMatch) {
          const verbs = parseHttpVerbs(verbsMatch[1]!);
          const paths = parseStringArgs(routesMatch[1]!).map(normalizePath);
          const idx = cls.configureStart + Math.min(verbsMatch.index, routesMatch.index);
          for (const method of verbs) {
            for (const path of paths) {
              localRoutes.push({ method, path, index: idx, length: verbsMatch[0].length });
            }
          }
        }
      }

      // Class-level [HttpGet("…")] attributes (FastEndpoints attribute config)
      ATTR_RE.lastIndex = 0;
      let am: RegExpExecArray | null;
      const classHeader = safe.slice(Math.max(0, cls.classIndex - 400), cls.classIndex);
      while ((am = ATTR_RE.exec(classHeader)) !== null) {
        localRoutes.push({
          method: am[1]!.toUpperCase(),
          path: normalizePath(am[2]!),
          index: Math.max(0, cls.classIndex - 400) + am.index,
          length: am[0].length,
        });
      }

      const versionMatch = cls.configureBody ? VERSION_CALL_RE.exec(cls.configureBody) : null;
      const version = versionMatch ? Number(versionMatch[1]) : 0;

      for (const route of localRoutes) {
        // In-file path (plus Version suffix). Group prefixes are applied in
        // postExtract; qualifiedName keeps this form so the pass is idempotent.
        let path = route.path === '' ? '/' : route.path;
        if (version > 0) path = joinPath(path, `v${version}`);

        const line = lineAt(safe, route.index);
        const node: Node = {
          id: `route:${filePath}:${line}:${route.method}:${path}`,
          kind: 'route',
          name: `${route.method} ${path}`,
          qualifiedName: `${filePath}::route:${route.method}:${path}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: route.length,
          language: 'csharp',
          updatedAt: now,
        };
        nodes.push(node);
        references.push({
          fromNodeId: node.id,
          referenceName: cls.className,
          referenceKind: 'references',
          line,
          column: 0,
          filePath,
          language: 'csharp',
        });
      }
    }

    return { nodes, references };
  },

  postExtract(context: ResolutionContext): Node[] {
    const groups = collectGroupPrefixes(context);
    if (groups.size === 0) return [];

    const updates: Node[] = [];
    for (const filePath of context.getAllFiles()) {
      if (!filePath.endsWith('.cs')) continue;
      const content = context.readFile(filePath);
      if (!content || !/\bGroup\s*</.test(content)) continue;

      const safe = stripCommentsForRegex(content, 'csharp');
      const existing = context.getNodesInFile(filePath).filter((n) => n.kind === 'route');

      for (const cls of findEndpointClasses(safe)) {
        if (!cls.configureBody) continue;
        const groupMatch = GROUP_CALL_RE.exec(cls.configureBody);
        if (!groupMatch) continue;
        const prefix = resolveGroupPrefix(groupMatch[1]!, groups);
        if (!prefix) continue;

        // Lines covered by this class's Configure() body
        const cfgStartLine = lineAt(safe, cls.configureStart);
        const cfgEndLine = lineAt(safe, cls.configureStart + cls.configureBody.length);

        for (const node of existing) {
          if (node.startLine < cfgStartLine || node.startLine > cfgEndLine) continue;
          const basePath =
            extractPathFromQualifiedName(node.qualifiedName) ??
            node.name.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '');
          // Skip if name already has the group prefix (idempotent re-run)
          const finalPath = joinPath(prefix, basePath);
          const method = (node.qualifiedName?.match(/::route:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS):/) ??
            node.name.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/))?.[1]!;
          const newName = `${method} ${finalPath}`;
          if (node.name === newName) continue;
          updates.push({ ...node, name: newName, updatedAt: Date.now() });
        }
      }
    }
    return updates;
  },
};

interface EndpointClass {
  className: string;
  classIndex: number;
  configureBody: string | null;
  configureStart: number;
}

interface GroupInfo {
  name: string;
  prefix: string;
  parent: string | null;
}

function findEndpointClasses(safe: string): EndpointClass[] {
  const results: EndpointClass[] = [];
  // Primary constructors put `(…)` between the name and `: Endpoint<…>`.
  const classRe =
    /(?:public\s+|internal\s+|sealed\s+|abstract\s+|partial\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*((?::\s*[^{]+)?|\([^;{]*\)\s*:\s*[^{]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(safe)) !== null) {
    const className = m[1]!;
    const heritage = m[2]!;
    if (!/\bEndpoint(?:WithoutRequest)?\b/.test(heritage) && !/\bEp\./.test(heritage)) {
      continue;
    }
    const bodyStart = m.index + m[0].length - 1; // at '{'
    const classBody = sliceBalanced(safe, bodyStart);
    const configure = extractConfigureBody(classBody);
    results.push({
      className,
      classIndex: m.index,
      configureBody: configure?.body ?? null,
      configureStart: configure ? bodyStart + 1 + configure.offset : 0,
    });
  }
  return results;
}

function extractConfigureBody(classBody: string): { body: string; offset: number } | null {
  const m = /(?:public\s+|protected\s+|internal\s+)?override\s+void\s+Configure\s*\(\s*\)\s*\{/.exec(
    classBody
  );
  if (!m) return null;
  const braceAt = m.index + m[0].length - 1;
  const body = sliceBalanced(classBody, braceAt);
  return { body, offset: m.index };
}

/** Slice `{…}` starting at `openBraceIndex`, returning inner content (no braces). */
function sliceBalanced(src: string, openBraceIndex: number): string {
  if (src[openBraceIndex] !== '{') return '';
  let depth = 0;
  for (let i = openBraceIndex; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(openBraceIndex + 1, i);
    }
  }
  return src.slice(openBraceIndex + 1);
}

function parseStringArgs(args: string): string[] {
  const out: string[] = [];
  const re = /["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) out.push(m[1]!);
  return out;
}

function parseHttpVerbs(args: string): string[] {
  const out: string[] = [];
  const re = /\bHttp\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Get|Post|Put|Patch|Delete|Head|Options)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) out.push(m[1]!.toUpperCase());
  return out;
}

function normalizePath(path: string): string {
  // Strip ASP.NET route constraints: {id:guid} → {id}
  let p = path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\s*:[^}]+\}/g, '{$1}');
  p = p.replace(/\\/g, '/');
  if (p === '') return '';
  if (!p.startsWith('/')) p = `/${p}`;
  // Collapse duplicate slashes but keep root
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function joinPath(prefix: string, sub: string): string {
  const a = prefix.replace(/^\/+|\/+$/g, '');
  const b = sub.replace(/^\/+|\/+$/g, '');
  if (!a && !b) return '/';
  if (!a) return normalizePath(b || '/');
  if (!b) return normalizePath(`/${a}`);
  return normalizePath(`/${a}/${b}`);
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

function collectGroupPrefixes(context: ResolutionContext): Map<string, GroupInfo> {
  const map = new Map<string, GroupInfo>();
  for (const filePath of context.getAllFiles()) {
    if (!filePath.endsWith('.cs')) continue;
    const content = context.readFile(filePath);
    if (!content) continue;
    const safe = stripCommentsForRegex(content, 'csharp');
    GROUP_CLASS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GROUP_CLASS_RE.exec(safe)) !== null) {
      const name = m[1]!;
      const parent = m[2] ?? null;
      const after = safe.slice(m.index, m.index + 800);
      const cfg = GROUP_CONFIGURE_RE.exec(after);
      const prefix = cfg ? normalizePath(cfg[1]!) : '';
      map.set(name, { name, prefix, parent });
    }
  }
  return map;
}

function resolveGroupPrefix(name: string, groups: Map<string, GroupInfo>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let cur: string | null = name;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const info = groups.get(cur);
    if (!info) break;
    if (info.prefix) parts.unshift(info.prefix.replace(/^\/+|\/+$/g, ''));
    cur = info.parent;
  }
  if (parts.length === 0) return '';
  return normalizePath('/' + parts.join('/'));
}

function extractPathFromQualifiedName(qn: string | undefined): string | null {
  if (!qn) return null;
  const m = qn.match(/::route:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS):(.+)$/);
  return m?.[1] ?? null;
}
