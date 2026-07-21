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
import { stripCommentsForRegex, type CommentLang } from '../../resolution/strip-comments';

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
    const allFiles = context.getAllFiles();
    return allFiles.some((f) => {
      if (!TS_FILE.test(f)) return false;
      const content = context.readFile(f);
      return content != null && (/@Route\s*\(/.test(content) || HTTP_DECORATOR_RE.test(content));
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
      const scopes = buildRouteScopes(safe);
      const existing = context.getNodesInFile(filePath).filter((n) => n.kind === 'route');

      for (const hit of findDecorators(safe, HTTP_METHODS)) {
        const scope = scopeFor(scopes, hit.index);
        if (!scope) continue;

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
  start: number;
  end: number;
}

interface ClassMeta {
  filePath: string;
  className: string;
  prefix: string | null;
  extendsName: string | null;
}

function extractFromSafe(
  filePath: string,
  safe: string,
  lang: Node['language']
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const scopes = buildRouteScopes(safe);

  for (const hit of findDecorators(safe, HTTP_METHODS)) {
    const method = hit.name.toUpperCase();
    const methodPath = parseStringArg(hit.args);
    const line = lineAt(safe, hit.index);
    const scope = scopeFor(scopes, hit.index);
    const prefix = scope?.effectivePrefix ?? scope?.prefix ?? '';
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

function findDecorators(safe: string, names: string[]): DecoratorHit[] {
  const hits: DecoratorHit[] = [];
  const re = new RegExp(`@(${names.join('|')})\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
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

function buildRouteScopes(safe: string): RouteScope[] {
  const localPrefix = new Map<string, string>();
  const extendsMap = new Map<string, string>();
  const classStarts = new Map<string, number>();

  const routeRe = /@Route\s*\(/g;
  let rm: RegExpExecArray | null;
  while ((rm = routeRe.exec(safe)) !== null) {
    const parsed = readArgs(safe, rm.index + rm[0].length - 1);
    if (!parsed) continue;
    const className = classNameAfter(safe, rm.index);
    if (className) localPrefix.set(className, parseStringArg(parsed.args));
  }

  const classRe =
    /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(safe)) !== null) {
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

  const scopes: RouteScope[] = [];
  for (const [className, start] of classStarts) {
    const prefix = localPrefix.get(className) ?? '';
    scopes.push({
      className,
      prefix,
      effectivePrefix: effectivePrefix(className),
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
    const prefixes = new Map<string, string>();
    const routeRe = /@Route\s*\(/g;
    let rm: RegExpExecArray | null;
    while ((rm = routeRe.exec(safe)) !== null) {
      const parsed = readArgs(safe, rm.index + rm[0].length - 1);
      if (!parsed) continue;
      const className = classNameAfter(safe, rm.index);
      if (className) prefixes.set(className, parseStringArg(parsed.args));
    }

    const classRe =
      /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(safe)) !== null) {
      out.push({
        filePath,
        className: cm[1]!,
        prefix: prefixes.get(cm[1]!) ?? null,
        extendsName: cm[2] ?? null,
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

    // Prefer a parent declared in the same file, then any project class with that name.
    const sameFile = byKey.get(`${m.filePath}::${m.extendsName}`);
    let prefix = '';
    if (sameFile) {
      prefix = resolve(`${sameFile.filePath}::${sameFile.className}`, seen);
    } else {
      for (const candidate of meta) {
        if (candidate.className !== m.extendsName) continue;
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
