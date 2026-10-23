/**
 * tsoa Framework Resolver (Kerno in-repo plugin)
 *
 * Detects routes from `@Route` + `@Get/@Post/@Put/@Patch/@Delete/@Head/@Options`
 * method decorators.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../../resolution/types';
import {
  blankStringContents,
  stripCommentsForRegex,
  type CommentLang,
} from '../../resolution/strip-comments';
import { resolveImportPath } from '../../resolution/import-resolver';
import {
  declaredDependencies,
  projectPackageNames,
} from '../../resolution/frameworks/package-deps';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'];
const HTTP_DECORATOR_RE = new RegExp(`@(${HTTP_METHODS.join('|')})\\s*\\(`);
const TS_FILE = /\.(m?tsx?|jsx?|cjs|mts|cts)$/;

export const tsoaResolver: FrameworkResolver = {
  name: 'tsoa',
  languages: ['typescript', 'javascript', 'tsx', 'jsx'],

  detect(context) {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.tsoa || deps['@tsoa/runtime'] || deps['@tsoa/cli']) {
          return true;
        }
      } catch {
        // ignore
      }
    }
    // Bare `@Get`/`@Post` is not tsoa — NestJS, routing-controllers, and others
    // share those names. Without a tsoa package, require `@Route(`.
    const allFiles = context.getAllFiles();
    return allFiles.some((f) => {
      if (!TS_FILE.test(f)) return false;
      const content = context.readFile(f);
      return content != null && /@Route\s*\(/.test(content);
    });
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!TS_FILE.test(filePath)) {
      return { nodes: [], references: [] };
    }
    if (!content.includes('@Route') && !HTTP_DECORATOR_RE.test(content)) {
      return { nodes: [], references: [] };
    }

    const lang = detectLanguage(filePath);
    const safe = stripCommentsForRegex(content, commentLangForFile(filePath));
    return extractFromSafe(filePath, safe, lang);
  },

  postExtract(context: ResolutionContext): Node[] {
    const classMeta = collectClassMetadata(context);
    const prefixByClass = resolveInheritedRoutePrefixes(classMeta);
    const updates: Node[] = [];

    for (const filePath of context.getAllFiles()) {
      if (!TS_FILE.test(filePath)) continue;
      const content = context.readFile(filePath);
      if (!content || (!content.includes('@Route') && !HTTP_DECORATOR_RE.test(content))) {
        continue;
      }

      const safe = stripCommentsForRegex(content, commentLangForFile(filePath));
      const code = blankStringContents(safe);
      const scopes = buildRouteScopes(safe, code);
      const existing = context.getNodesInFile(filePath).filter((n) => n.kind === 'route');

      for (const hit of findDecorators(safe, code, HTTP_METHODS)) {
        const scope = scopeFor(scopes, hit.index);
        if (!scope || scope.isNestController) continue;

        const inherited =
          scope.effectivePrefix || prefixByClass.get(`${filePath}::${scope.className}`) || '';
        if (!inherited) continue;

        const method = hit.name.toUpperCase();
        const methodPath = parseStringArg(hit.args);
        const originalPath = joinPath(scope.prefix, methodPath);
        const fullPath = joinPath(inherited, methodPath);
        if (fullPath === originalPath && scope.effectivePrefix) continue;

        const line = lineAt(safe, hit.index);
        const node = existing.find(
          (n) => n.startLine === line && n.name.startsWith(`${method} `)
        );
        if (!node) continue;

        const newName = `${method} ${fullPath}`;
        if (node.name === newName) continue;
        updates.push({ ...node, name: newName, updatedAt: Date.now() });
      }
    }

    return updates;
  },
};

interface DecoratorHit {
  name: string;
  args: string;
  index: number;
  end: number;
  length: number;
}

interface RouteScope {
  className: string;
  prefix: string;
  effectivePrefix: string;
  /** True when this class or a same-file ancestor declares `@Route`. */
  isTsoa: boolean;
  /** True when this class declares `@Controller` (NestJS). */
  isNestController: boolean;
  extendsName: string | null;
  start: number;
  end: number;
}

interface ClassMeta {
  filePath: string;
  className: string;
  prefix: string | null;
  extendsName: string | null;
  /**
   * Where the parent class comes from when it is imported: the project file the
   * import resolves to, `null` for a declared dependency (`Controller` from
   * `tsoa`), which carries no project `@Route`. `undefined` when the parent is
   * not imported or its source cannot be placed.
   */
  extendsFile?: string | null;
}

function extractFromSafe(
  filePath: string,
  safe: string,
  lang: Node['language']
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const code = blankStringContents(safe);
  const scopes = buildRouteScopes(safe, code);

  for (const hit of findDecorators(safe, code, HTTP_METHODS)) {
    const scope = scopeFor(scopes, hit.index);
    // NestJS `@Controller` classes share `@Get`/`@Post` with tsoa; leave them
    // to the Nest resolver. Allow `@Route` and `extends` (cross-file inherit).
    if (!scope || scope.isNestController) continue;
    if (!scope.isTsoa && !scope.extendsName) continue;
    const method = hit.name.toUpperCase();
    const methodPath = parseStringArg(hit.args);
    const line = lineAt(safe, hit.index);
    const prefix = scope.effectivePrefix || scope.prefix;
    const path = joinPath(prefix, methodPath);
    const handler = methodNameAfter(safe, hit.end);

    const node: Node = {
      id: `route:${filePath}:${line}:${method}:${path}`,
      kind: 'route',
      name: `${method} ${path}`,
      qualifiedName: `${filePath}::${method}:${path}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: hit.length,
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
  }

  return { nodes, references };
}

/**
 * Decorator hits are found in [code] (string contents blanked, so a decorator
 * written inside a string — a test fixture's source text — is not one) and
 * their arguments read from [safe] at the same offsets.
 */
function findDecorators(safe: string, code: string, names: string[]): DecoratorHit[] {
  const hits: DecoratorHit[] = [];
  const re = new RegExp(`@(${names.join('|')})\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const openIndex = m.index + m[0].length - 1;
    const parsed = readArgs(safe, openIndex);
    if (!parsed) continue;
    hits.push({
      name: m[1]!,
      args: parsed.args,
      index: m.index,
      end: parsed.end,
      length: parsed.end - m.index,
    });
    re.lastIndex = parsed.end;
  }
  return hits;
}

function readArgs(s: string, openIndex: number): { args: string; end: number } | null {
  if (s[openIndex] !== '(') return null;
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { args: s.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

function methodNameAfter(safe: string, start: number): string | null {
  let i = start;
  const ws = /\s*/y;
  const decoName = /@[\w.]+/y;
  const modifier = /(?:public|private|protected|async|static|readonly|override)\b/y;
  const ident = /([A-Za-z_$][\w$]*)\s*\(/y;

  const eatWs = (): void => {
    ws.lastIndex = i;
    if (ws.exec(safe)) i = ws.lastIndex;
  };

  for (;;) {
    eatWs();
    if (safe[i] !== '@') break;
    decoName.lastIndex = i;
    if (!decoName.exec(safe)) break;
    i = decoName.lastIndex;
    eatWs();
    if (safe[i] === '<') {
      const close = typeArgsEnd(safe, i);
      if (close < 0) return null;
      i = close;
      eatWs();
    }
    if (safe[i] === '(') {
      const parsed = readArgs(safe, i);
      if (!parsed) return null;
      i = parsed.end;
    }
  }

  for (;;) {
    eatWs();
    modifier.lastIndex = i;
    if (modifier.exec(safe) && modifier.lastIndex > i) {
      i = modifier.lastIndex;
      continue;
    }
    break;
  }

  eatWs();
  ident.lastIndex = i;
  const m = ident.exec(safe);
  return m ? m[1]! : null;
}

/** Class scopes found in [code] (string contents blanked); `@Route` arguments read from [safe]. */
function buildRouteScopes(safe: string, code: string): RouteScope[] {
  const localPrefix = new Map<string, string>();
  const extendsMap = new Map<string, string>();
  const classStarts = new Map<string, number>();

  const nestControllers = new Set<string>();

  const routeRe = /@Route\s*\(/g;
  let rm: RegExpExecArray | null;
  while ((rm = routeRe.exec(code)) !== null) {
    const parsed = readArgs(safe, rm.index + rm[0].length - 1);
    if (!parsed) continue;
    const className = classNameAfter(code, rm.index);
    if (className) localPrefix.set(className, parseStringArg(parsed.args));
  }

  const controllerRe = /@Controller\s*\(/g;
  let cmCtrl: RegExpExecArray | null;
  while ((cmCtrl = controllerRe.exec(code)) !== null) {
    const parsed = readArgs(code, cmCtrl.index + cmCtrl[0].length - 1);
    if (!parsed) continue;
    const className = classNameAfter(code, cmCtrl.index);
    if (className) nestControllers.add(className);
  }

  const classRe =
    /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(code)) !== null) {
    classStarts.set(cm[1]!, cm.index);
    if (cm[2]) extendsMap.set(cm[1]!, cm[2]!);
  }

  const effectivePrefix = (className: string, seen = new Set<string>()): string => {
    if (seen.has(className)) return '';
    seen.add(className);
    const own = localPrefix.get(className);
    if (own !== undefined) return own;
    const parent = extendsMap.get(className);
    if (!parent) return '';
    return effectivePrefix(parent, seen);
  };

  const hasRouteAnnotation = (className: string, seen = new Set<string>()): boolean => {
    if (seen.has(className)) return false;
    seen.add(className);
    if (localPrefix.has(className)) return true;
    const parent = extendsMap.get(className);
    return parent ? hasRouteAnnotation(parent, seen) : false;
  };

  const scopes: RouteScope[] = [];
  for (const [className, start] of classStarts) {
    const prefix = localPrefix.get(className) ?? '';
    scopes.push({
      className,
      prefix,
      effectivePrefix: effectivePrefix(className),
      isTsoa: hasRouteAnnotation(className),
      isNestController: nestControllers.has(className),
      extendsName: extendsMap.get(className) ?? null,
      start,
      end: safe.length,
    });
  }

  scopes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < scopes.length; i++) {
    scopes[i]!.end = i + 1 < scopes.length ? scopes[i + 1]!.start : safe.length;
  }

  return scopes;
}

function classNameAfter(safe: string, start: number): string | null {
  let i = start;
  const ws = /\s*/y;
  const decoName = /@[\w.]+/y;
  const classDecl =
    /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/y;

  const eatWs = (): void => {
    ws.lastIndex = i;
    if (ws.exec(safe)) i = ws.lastIndex;
  };

  for (;;) {
    eatWs();
    if (safe[i] !== '@') break;
    decoName.lastIndex = i;
    if (!decoName.exec(safe)) break;
    i = decoName.lastIndex;
    eatWs();
    if (safe[i] === '<') {
      const close = typeArgsEnd(safe, i);
      if (close < 0) return null;
      i = close;
      eatWs();
    }
    if (safe[i] === '(') {
      const parsed = readArgs(safe, i);
      if (!parsed) return null;
      i = parsed.end;
    }
  }

  eatWs();
  classDecl.lastIndex = i;
  const m = classDecl.exec(safe);
  return m ? m[1]! : null;
}

/**
 * Index just past the `>` closing the type-argument list opened at `open`
 * (`@Response<ApiErrorPayload>(…)`, `@Response<{ a: string; b: number }>(…)`),
 * or -1 when it never closes. An arrow's `=>` inside the list is not a closing
 * bracket.
 */
function typeArgsEnd(safe: string, open: number): number {
  let depth = 0;
  for (let i = open; i < safe.length; i++) {
    const ch = safe[i]!;
    if (ch === '<') depth++;
    else if (ch === '>' && safe[i - 1] !== '=') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function scopeFor(scopes: RouteScope[], index: number): RouteScope | null {
  for (const s of scopes) {
    if (index >= s.start && index < s.end) return s;
  }
  return null;
}

function parseStringArg(args: string): string {
  const m = args.match(/^\s*['"`]([^'"`]*)['"`]/);
  return m ? m[1]! : '';
}

function joinPath(prefix: string, methodPath: string): string {
  const sub = methodPath.trim();
  const base = joinHttpPath(prefix, sub === '/' ? '' : sub);
  if (sub === '/') return base.endsWith('/') ? base : `${base}/`;
  return base;
}

function joinHttpPath(prefix: string, sub: string): string {
  const parts = [prefix, sub]
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
}

function lineAt(safe: string, index: number): number {
  return safe.slice(0, index).split('\n').length;
}

function detectLanguage(filePath: string): Node['language'] {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.ts') || filePath.endsWith('.mts') || filePath.endsWith('.cts')) {
    return 'typescript';
  }
  return 'javascript';
}

function commentLangForFile(filePath: string): CommentLang {
  if (/\.(jsx?|cjs)$/.test(filePath)) return 'javascript';
  return 'typescript';
}

function collectClassMetadata(context: ResolutionContext): ClassMeta[] {
  const out: ClassMeta[] = [];
  for (const filePath of context.getAllFiles()) {
    if (!TS_FILE.test(filePath)) continue;
    const content = context.readFile(filePath);
    if (!content || (!content.includes('@Route') && !/\bclass\s+/.test(content))) continue;

    const safe = stripCommentsForRegex(content, commentLangForFile(filePath));
    // A class written inside a string (a test fixture's source text) is not a class.
    const code = blankStringContents(safe);
    const prefixes = new Map<string, string>();
    const routeRe = /@Route\s*\(/g;
    let rm: RegExpExecArray | null;
    while ((rm = routeRe.exec(code)) !== null) {
      const parsed = readArgs(safe, rm.index + rm[0].length - 1);
      if (!parsed) continue;
      const className = classNameAfter(code, rm.index);
      if (className) prefixes.set(className, parseStringArg(parsed.args));
    }

    const classRe =
      /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(code)) !== null) {
      const extendsName = cm[2] ?? null;
      out.push({
        filePath,
        className: cm[1]!,
        prefix: prefixes.get(cm[1]!) ?? null,
        extendsName,
        extendsFile: extendsName ? importedFrom(context, filePath, extendsName) : undefined,
      });
    }
  }
  return out;
}

function resolveInheritedRoutePrefixes(meta: ClassMeta[]): Map<string, string> {
  const byKey = new Map<string, ClassMeta>();
  for (const m of meta) {
    byKey.set(`${m.filePath}::${m.className}`, m);
  }

  const cache = new Map<string, string>();
  const resolve = (key: string, seen = new Set<string>()): string => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (seen.has(key)) return '';
    seen.add(key);

    const m = byKey.get(key);
    if (!m) {
      cache.set(key, '');
      return '';
    }
    if (m.prefix) {
      cache.set(key, m.prefix);
      return m.prefix;
    }
    if (!m.extendsName) {
      cache.set(key, '');
      return '';
    }

    // Prefer a parent declared in the same file, then the one in the file it is
    // imported from; a parent from a declared dependency has no project prefix.
    // Otherwise — not imported, or imported through a barrel that only
    // re-exports it — any project class with that name.
    const sameFile = byKey.get(`${m.filePath}::${m.extendsName}`);
    let prefix = '';
    if (sameFile) {
      prefix = resolve(`${sameFile.filePath}::${sameFile.className}`, seen);
    } else if (m.extendsFile !== null) {
      const named = meta.filter((c) => c.className === m.extendsName);
      const inImportedFile = named.filter((c) => c.filePath === m.extendsFile);
      for (const candidate of inImportedFile.length > 0 ? inImportedFile : named) {
        prefix = resolve(`${candidate.filePath}::${candidate.className}`, seen);
        if (prefix) break;
      }
    }
    cache.set(key, prefix);
    return prefix;
  };

  const out = new Map<string, string>();
  for (const m of meta) {
    const key = `${m.filePath}::${m.className}`;
    const prefix = resolve(key);
    if (prefix) out.set(key, prefix);
  }
  return out;
}

/**
 * The project file [localName] is imported from in [filePath]: `null` when it
 * comes from an installed dependency, `undefined` when it is not imported or
 * its source is neither a project file nor an installed dependency (an alias
 * the resolver cannot follow, or a workspace sibling package, say).
 */
function importedFrom(
  context: ResolutionContext,
  filePath: string,
  localName: string
): string | null | undefined {
  if (typeof context.getImportMappings !== 'function') return undefined;
  const lang = commentLangForFile(filePath);
  const mapping = context
    .getImportMappings(filePath, lang)
    .find((im) => im.localName === localName);
  if (!mapping) return undefined;
  const resolved = resolveImportPath(mapping.source, filePath, lang, context);
  if (resolved) return resolved;
  const pkg = packageName(mapping.source);
  const installed = declaredDependencies(context).has(pkg) && !projectPackageNames(context).has(pkg);
  return installed ? null : undefined;
}

/** `tsoa` for `tsoa`, `@tsoa/runtime` for `@tsoa/runtime/dist/x`. */
function packageName(source: string): string {
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}
