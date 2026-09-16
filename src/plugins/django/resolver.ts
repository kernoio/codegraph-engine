/**
 * Django + DRF Framework Resolver (Kerno in-repo plugin)
 *
 * Replaces stock `django` (same resolver name) so parse workers pick this up.
 *
 * Per-file extract():
 *   - path() / re_path() / url() → route nodes (CBV `.as_view()`, function
 *     views, dotted paths, include())
 *   - DRF `router.register('prefix', ViewSet)` — including project-defined
 *     bases whose class name is not `*View` / `*ViewSet` (BE-3183)
 *
 * postExtract():
 *   - Compose `include('app.urls')` prefixes onto the included file (BE-3184)
 *   - Compose same-file `include([ path()... ])` / nested `re_path` lists
 *     onto the inner views (BE-3184)
 *   - Compose `include(router.urls)` / `urlpatterns += router.urls` prefixes
 *     onto `router.register` routes (BE-3199)
 *
 * `id` and `qualifiedName` stay stable so the pass is idempotent.
 *
 * Known gaps (precision over recall):
 *   - `include(extra_patterns)` where the list is a variable, not a literal
 *   - computed / non-literal prefixes
 *   - expanding ViewSet CRUD verbs (`GET/POST …`) — still one VIEWSET node
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';
import { resolveImportPath } from '../../resolution/import-resolver';

const DRF_ROUTER_CLS = /\b(?:DefaultRouter|SimpleRouter)\s*\(/;
const DRF_IMPORT = /\bfrom\s+rest_framework\b|\bimport\s+rest_framework\b/;
const VIEWSET_NAME = /View(Set)?$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const ROUTE_QN = '::route:';
const VIEWSET_QN = 'VIEWSET:';
const INCLUDE_QN = 'include:';

export const djangoResolver: FrameworkResolver = {
  name: 'django',
  languages: ['python'],

  detect(context) {
    const requirements = context.readFile('requirements.txt');
    if (requirements && requirements.toLowerCase().includes('django')) return true;
    const setup = context.readFile('setup.py');
    if (setup && setup.toLowerCase().includes('django')) return true;
    const pyproject = context.readFile('pyproject.toml');
    if (pyproject && pyproject.toLowerCase().includes('django')) return true;
    return context.fileExists('manage.py');
  },

  resolve(ref, context) {
    if (ref.referenceName.endsWith('Model') || /^[A-Z][a-z]+$/.test(ref.referenceName)) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, MODEL_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }
    if (ref.referenceName.endsWith('View') || ref.referenceName.endsWith('ViewSet')) {
      const result = resolveByNameAndKind(ref.referenceName, VIEW_KINDS, VIEW_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }
    if (ref.referenceName.endsWith('Form')) {
      const result = resolveByNameAndKind(ref.referenceName, CLASS_KINDS, FORM_DIRS, context);
      if (result) return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
    }
    // ORM dynamic dispatch: QuerySet._fetch_all (and siblings) call
    // `self._iterable_class(self)` — a runtime dispatch to the iterable class
    // (default ModelIterable) whose __iter__ runs the SQL compiler.
    if (ref.referenceName === '_iterable_class') {
      const target = resolveModelIterableIter(context);
      if (target) return { original: ref, targetNodeId: target, confidence: 0.7, resolvedBy: 'framework' };
    }
    return null;
  },

  claimsReference(name) {
    return name === '_iterable_class' || name.endsWith('.urls');
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.py')) return { nodes: [], references: [] };

    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const safe = stripCommentsForRegex(content, 'python');

    // Walk path() / re_path() / url() with balanced parens so an
    // include([path(...), ...]) list does not swallow the inner views.
    const callRe = /\b(?:path|re_path|url)\s*\(/g;
    let call: RegExpExecArray | null;
    while ((call = callRe.exec(safe)) !== null) {
      const open = call.index + call[0].length - 1;
      const close = matchDelim(safe, open, '(', ')');
      if (close < 0) continue;
      const args = splitTopLevelArgs(safe.slice(open + 1, close));
      const pathArg = /^\s*r?['"]([^'"]+)['"]/.exec(args[0] ?? '');
      if (!pathArg) continue;
      const urlPath = pathArg[1]!;
      const handler = (args[1] ?? '').trim();
      const line = lineAt(safe, call.index);
      const isInclude = /^include\s*\(/.test(handler);
      const routeNode: Node = {
        id: `route:${filePath}:${line}:${urlPath}`,
        kind: 'route',
        name: urlPath,
        qualifiedName: isInclude
          ? `${filePath}${ROUTE_QN}${INCLUDE_QN}${urlPath}`
          : `${filePath}${ROUTE_QN}${urlPath}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: close - call.index + 1,
        language: 'python',
        updatedAt: now,
      };
      nodes.push(routeNode);

      const target = resolveHandlerName(handler);
      if (target) {
        references.push({
          fromNodeId: routeNode.id,
          referenceName: target.name,
          referenceKind: target.kind,
          line,
          column: 0,
          filePath,
          language: 'python',
        });
      }
    }

    // DRF router.register('prefix', ViewSet). The STRING first arg separates
    // this from admin.site.register(Model, Admin). Receiver `*router*` or a
    // DRF import/class in the file lets project-base classes (UserAPI) through.
    const routerRegex = /(\b[A-Za-z_]\w*)\.register\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*([\w.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = routerRegex.exec(safe)) !== null) {
      const receiver = match[1]!;
      const prefix = match[2]!.replace(/^\^|\/?\$$/g, '');
      const viewset = match[3]!.split('.').pop()!;
      if (!isViewSetRegistration(receiver, viewset, safe)) continue;
      const line = lineAt(safe, match.index);
      const routeNode: Node = {
        id: `route:${filePath}:${line}:VIEWSET:${prefix}`,
        kind: 'route',
        name: `VIEWSET /${prefix}`,
        qualifiedName: `${filePath}${ROUTE_QN}${VIEWSET_QN}${receiver}:${prefix}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: match[0].length,
        language: 'python',
        updatedAt: now,
      };
      nodes.push(routeNode);
      references.push({
        fromNodeId: routeNode.id,
        referenceName: viewset,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: 'python',
      });
    }

    return { nodes, references };
  },

  postExtract(context: ResolutionContext): Node[] {
    const files = context.getAllFiles().filter((f) => f.endsWith('.py'));
    const parsed = new Map<string, ParsedFile>();
    for (const file of files) {
      const content = context.readFile(file);
      if (!content) continue;
      if (!/\b(?:path|re_path|url|include|register)\s*\(/.test(content) && !/\.urls\b/.test(content)) {
        continue;
      }
      parsed.set(file, parseUrlconf(file, stripCommentsForRegex(content, 'python')));
    }
    if (parsed.size === 0) return [];

    const filePrefix = composeFilePrefixes(parsed, context);
    const routerMounts = collectRouterMounts(parsed, context);

    const updates: Node[] = [];
    for (const [file, info] of parsed) {
      const routes = context.getNodesInFile(file).filter((n) => n.kind === 'route');
      if (routes.length === 0) continue;
      for (const route of routes) {
        const orig = originalFromQn(route.qualifiedName);
        if (orig.kind === 'include') continue;

        let prefix = '';
        if (orig.kind === 'viewset') {
          prefix = viewsetMountPrefix(file, orig.receiver ?? '', filePrefix, routerMounts);
        } else {
          const inline = inlinePrefixAt(info, route.startLine);
          prefix = joinDjango(filePrefix.get(file) ?? '', inline);
        }
        if (prefix === '') continue;

        const composed = joinDjango(prefix, orig.path);
        const newName =
          orig.kind === 'viewset' ? `VIEWSET /${composed.replace(/^\//, '')}` : composed;
        if (newName !== route.name) updates.push({ ...route, name: newName });
      }
    }
    return updates;
  },
};

interface InlineInclude {
  prefix: string;
  start: number;
  end: number;
}

interface ModuleMount {
  prefix: string;
  module: string;
}

interface RouterMount {
  prefix: string;
  routerVar: string;
  file: string;
}

interface ParsedFile {
  file: string;
  safe: string;
  inlines: InlineInclude[];
  modules: ModuleMount[];
  routers: RouterMount[];
  routerDefs: Set<string>;
}

interface OriginalPath {
  kind: 'viewset' | 'include' | 'path';
  receiver?: string;
  path: string;
}

function parseUrlconf(file: string, safe: string): ParsedFile {
  const inlines: InlineInclude[] = [];
  const modules: ModuleMount[] = [];
  const routers: RouterMount[] = [];
  const routerDefs = new Set<string>();

  const def = /\b([A-Za-z_]\w*)\s*=\s*(?:[\w.]+\.)?(?:DefaultRouter|SimpleRouter)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = def.exec(safe)) !== null) routerDefs.add(m[1]!);

  const includeCall = /\binclude\s*\(/g;
  while ((m = includeCall.exec(safe)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(safe, open, '(', ')');
    if (close < 0) continue;
    const inner = safe.slice(open + 1, close);
    const prefix = prefixBeforeInclude(safe, m.index);
    const parsed = parseIncludeArg(inner);
    if (!parsed) continue;
    if (parsed.kind === 'list') {
      const listOpen = inner.indexOf('[');
      if (listOpen < 0 || prefix === null) continue;
      const absOpen = open + 1 + listOpen;
      const absClose = matchDelim(safe, absOpen, '[', ']');
      if (absClose < 0) continue;
      inlines.push({ prefix, start: absOpen, end: absClose });
    } else if (parsed.kind === 'module' && prefix !== null) {
      modules.push({ prefix, module: parsed.module });
    } else if (parsed.kind === 'router' && prefix !== null) {
      routers.push({ prefix, routerVar: parsed.varName, file });
    }
  }

  const plus = /\burlpatterns\s*\+=\s*([A-Za-z_]\w*)\.urls/g;
  while ((m = plus.exec(safe)) !== null) {
    routers.push({ prefix: '', routerVar: m[1]!, file });
  }
  const assign = /\burlpatterns\s*=\s*([A-Za-z_]\w*)\.urls\b/g;
  while ((m = assign.exec(safe)) !== null) {
    routers.push({ prefix: '', routerVar: m[1]!, file });
  }

  return { file, safe, inlines, modules, routers, routerDefs };
}

function parseIncludeArg(
  arg: string
): { kind: 'module'; module: string } | { kind: 'router'; varName: string } | { kind: 'list' } | null {
  const trimmed = arg.trim();
  const mod = /^[\(\s]*['"]([^'"]+)['"]/.exec(trimmed);
  if (mod) return { kind: 'module', module: mod[1]! };
  const router = /^[\(\s]*([A-Za-z_]\w*)\.urls\b/.exec(trimmed);
  if (router) return { kind: 'router', varName: router[1]! };
  if (trimmed.startsWith('[')) return { kind: 'list' };
  return null;
}

function prefixBeforeInclude(safe: string, includeIdx: number): string | null {
  const from = Math.max(0, includeIdx - 240);
  const before = safe.slice(from, includeIdx);
  const m = /\b(?:path|re_path|url)\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*$/.exec(before);
  return m ? m[1]! : null;
}

function composeFilePrefixes(
  parsed: Map<string, ParsedFile>,
  context: ResolutionContext
): Map<string, string> {
  const mounts = new Map<string, Array<{ prefix: string; target: string }>>();
  for (const [file, info] of parsed) {
    for (const mount of info.modules) {
      const target = resolveModuleFile(mount.module, context);
      if (!target || target === file) continue;
      const list = mounts.get(file) ?? [];
      list.push({ prefix: mount.prefix, target });
      mounts.set(file, list);
    }
  }
  if (mounts.size === 0) return new Map();

  let prefixOf = new Map<string, string>();
  for (let round = 0; round < 8; round++) {
    const next = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const [file, list] of mounts) {
      const base = prefixOf.get(file) ?? '';
      for (const { prefix, target } of list) {
        const full = joinDjango(base, prefix);
        const seen = next.get(target);
        if (seen !== undefined && seen !== full) ambiguous.add(target);
        else next.set(target, full);
      }
    }
    for (const a of ambiguous) next.delete(a);
    let changed = next.size !== prefixOf.size;
    if (!changed) for (const [k, v] of next) if (prefixOf.get(k) !== v) changed = true;
    prefixOf = next;
    if (!changed) break;
  }
  return prefixOf;
}

interface ResolvedRouterMount {
  prefix: string;
  hostFile: string;
}

function collectRouterMounts(
  parsed: Map<string, ParsedFile>,
  context: ResolutionContext
): Map<string, ResolvedRouterMount[]> {
  const out = new Map<string, ResolvedRouterMount[]>();
  for (const [file, info] of parsed) {
    for (const mount of info.routers) {
      const defFile = resolveRouterDefiningFile(mount.routerVar, file, parsed, context);
      if (!defFile) continue;
      const key = routerKey(defFile, mount.routerVar);
      const list = out.get(key) ?? [];
      list.push({ prefix: mount.prefix, hostFile: file });
      out.set(key, list);
    }
  }
  return out;
}

function resolveRouterDefiningFile(
  varName: string,
  fromFile: string,
  parsed: Map<string, ParsedFile>,
  context: ResolutionContext
): string | null {
  const local = parsed.get(fromFile);
  if (local?.routerDefs.has(varName)) return fromFile;
  let mappings: { localName: string; source: string; exportedName: string }[] = [];
  try {
    mappings = context.getImportMappings(fromFile, 'python');
  } catch {
    mappings = [];
  }
  const mapping = mappings.find((im) => im.localName === varName);
  if (!mapping) {
    // Same-file use without a DefaultRouter() we recognised (e.g. a helper).
    if (local) return fromFile;
    return null;
  }
  const resolved =
    resolveImportPath(mapping.source, fromFile, 'python', context) ??
    resolveModuleFile(mapping.source, context);
  return resolved ?? fromFile;
}

function viewsetMountPrefix(
  registerFile: string,
  receiver: string,
  filePrefix: Map<string, string>,
  routerMounts: Map<string, ResolvedRouterMount[]>
): string {
  const key = routerKey(registerFile, receiver);
  const mounts = routerMounts.get(key) ?? [];
  // include(imported.urls) keys off the defining file; try that too.
  const extras: ResolvedRouterMount[] = [];
  for (const [k, list] of routerMounts) {
    if (k === key) continue;
    if (k.endsWith(`\0${receiver}`)) extras.push(...list);
  }
  const all = mounts.length > 0 ? mounts : extras;

  if (all.length === 1) {
    const m = all[0]!;
    return joinDjango(filePrefix.get(m.hostFile) ?? '', m.prefix);
  }
  if (all.length > 1) {
    const composed = all.map((m) => joinDjango(filePrefix.get(m.hostFile) ?? '', m.prefix));
    if (composed.every((p) => p === composed[0])) return composed[0]!;
  }
  return filePrefix.get(registerFile) ?? '';
}

function routerKey(file: string, varName: string): string {
  return `${file}\0${varName}`;
}

function inlinePrefixAt(info: ParsedFile, startLine: number): string {
  if (info.inlines.length === 0) return '';
  // Recompute line offsets: a route at startLine is inside an include list
  // when some character of that line sits in (start, end).
  const lineStart = offsetOfLine(info.safe, startLine);
  if (lineStart < 0) return '';
  const hits = info.inlines
    .filter((inc) => lineStart > inc.start && lineStart < inc.end)
    .sort((a, b) => a.start - b.start);
  let prefix = '';
  for (const h of hits) prefix = joinDjango(prefix, h.prefix);
  return prefix;
}

function originalFromQn(qn: string): OriginalPath {
  const idx = qn.indexOf(ROUTE_QN);
  if (idx < 0) return { kind: 'path', path: '' };
  const rest = qn.slice(idx + ROUTE_QN.length);
  if (rest.startsWith(VIEWSET_QN)) {
    const body = rest.slice(VIEWSET_QN.length);
    const c = body.indexOf(':');
    if (c < 0) return { kind: 'viewset', receiver: '', path: body };
    return { kind: 'viewset', receiver: body.slice(0, c), path: body.slice(c + 1) };
  }
  if (rest.startsWith(INCLUDE_QN)) {
    return { kind: 'include', path: rest.slice(INCLUDE_QN.length) };
  }
  return { kind: 'path', path: rest };
}

function isViewSetRegistration(receiver: string, viewset: string, fileContent: string): boolean {
  if (VIEWSET_NAME.test(viewset)) return true;
  if (!PASCAL.test(viewset)) return false;
  if (/router/i.test(receiver)) return true;
  if (DRF_ROUTER_CLS.test(fileContent) || DRF_IMPORT.test(fileContent)) return true;
  return false;
}

function resolveModuleFile(mod: string, context: ResolutionContext): string | null {
  if (!mod) return null;
  const rel = mod.replace(/\./g, '/');
  const candidates = [`${rel}.py`, `${rel}/__init__.py`];
  for (const c of candidates) {
    if (context.fileExists(c)) return c;
  }
  const want = `${rel}.py`;
  for (const f of context.getAllFiles()) {
    const n = f.replace(/\\/g, '/');
    if (n === want || n.endsWith('/' + want)) return f;
  }
  return null;
}

/** Strip regex anchors / named groups so `^api/` + `^tags/?$` → `api/tags/`. */
export function normalizeDjangoPath(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\^/, '');
  s = s.replace(/\$$/, '');
  s = s.replace(/\(\?P<(\w+)>[^)]*\)/g, '{$1}');
  s = s.replace(/\(\?<(\w+)>[^)]*\)/g, '{$1}');
  s = s.replace(/\/\?$/, '/');
  return s;
}

export function joinDjango(prefix: string, path: string): string {
  const a = normalizeDjangoPath(prefix).replace(/\/+$/, '');
  const b = normalizeDjangoPath(path).replace(/^\/+/, '');
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function offsetOfLine(source: string, line: number): number {
  if (line <= 1) return 0;
  let seen = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      seen++;
      if (seen === line) return i + 1;
    }
  }
  return -1;
}

function splitTopLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      for (; i < args.length && args[i] !== q; i++) {
        if (args[i] === '\\') i++;
      }
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

function matchDelim(s: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      for (; i < s.length && s[i] !== q; i++) {
        if (s[i] === '\\') i++;
      }
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function resolveModelIterableIter(context: ResolutionContext): string | null {
  const cls = context.getNodesByName('ModelIterable').find((n) => n.kind === 'class');
  if (!cls) return null;
  const iter = context.getNodesByName('__iter__').find(
    (n) => n.filePath === cls.filePath && n.startLine >= cls.startLine && n.startLine <= cls.endLine
  );
  return iter ? iter.id : null;
}

function resolveHandlerName(expr: string): { name: string; kind: 'references' | 'imports' } | null {
  const includeMatch = expr.match(/^include\s*\(\s*['"]([^'"]+)['"]/);
  if (includeMatch) return { name: includeMatch[1]!, kind: 'imports' };

  let head = expr.replace(/\.as_view\s*\([^)]*\)\s*$/, '');
  head = head.replace(/\.\w+\s*\([^)]*\)\s*$/, '');

  const dotted = head.split('.').filter(Boolean);
  if (dotted.length === 0) return null;
  const last = dotted[dotted.length - 1]!;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) return null;

  return { name: last, kind: 'references' };
}

const MODEL_DIRS = ['models', 'app/models', 'src/models'];
const VIEW_DIRS = ['views', 'app/views', 'src/views', 'api/views'];
const FORM_DIRS = ['forms', 'app/forms', 'src/forms'];
const CLASS_KINDS = new Set(['class']);
const VIEW_KINDS = new Set(['class', 'function']);

function resolveByNameAndKind(
  name: string,
  kinds: Set<string>,
  preferredDirPatterns: string[],
  context: ResolutionContext
): string | null {
  const candidates = context.getNodesByName(name);
  if (candidates.length === 0) return null;
  const kindFiltered = candidates.filter((n) => kinds.has(n.kind));
  if (kindFiltered.length === 0) return null;
  if (preferredDirPatterns.length > 0) {
    const preferred = kindFiltered.filter((n) => preferredDirPatterns.some((d) => n.filePath.includes(d)));
    if (preferred.length > 0) return preferred[0]!.id;
  }
  return kindFiltered[0]!.id;
}
