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
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'];

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
      if (!/\.(tsx?|jsx?|mts|cts)$/.test(f)) return false;
      const content = context.readFile(f);
      return content != null && /@Route\s*\(/.test(content);
    });
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!/\.(m?tsx?|jsx?|cjs|mts|cts)$/.test(filePath)) {
      return { nodes: [], references: [] };
    }
    if (!content.includes('@Route') && !content.includes('@Get')) {
      return { nodes: [], references: [] };
    }

    const lang = filePath.endsWith('.tsx')
      ? 'tsx'
      : filePath.endsWith('.jsx')
        ? 'jsx'
        : filePath.endsWith('.ts') || filePath.endsWith('.mts') || filePath.endsWith('.cts')
          ? 'typescript'
          : 'javascript';
    const commentLang = lang === 'tsx' || lang === 'jsx' ? 'typescript' : lang;
    const safe = stripCommentsForRegex(content, commentLang);
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();

    const classPrefix = parseRoutePrefixes(safe);
    const methodRe = new RegExp(
      `@(${HTTP_METHODS.join('|')})\\s*\\(\\s*(['\`"]([^'\`"]*)['\`"])?`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = methodRe.exec(safe)) !== null) {
      const method = match[1]!.toUpperCase();
      const methodPath = match[3] ?? '';
      const line = safe.slice(0, match.index).split('\n').length;
      const prefix = prefixFor(classPrefix, match.index);
      const path = joinPath(prefix, methodPath);
      const handler = methodNameAfter(safe, match.index + match[0].length);

      const node: Node = {
        id: `route:${filePath}:${line}:${method}:${path}`,
        kind: 'route',
        name: `${method} ${path}`,
        qualifiedName: `${filePath}::${method}:${path}`,
        filePath,
        startLine: line,
        endLine: line,
        startColumn: 0,
        endColumn: match[0].length,
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
  },
};

interface RouteScope {
  prefix: string;
  start: number;
  end: number;
}

function parseRoutePrefixes(safe: string): RouteScope[] {
  const hits: Array<{ prefix: string; index: number }> = [];
  const re = /@Route\s*\(\s*['"`]([^'"`]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    hits.push({ prefix: m[1]!, index: m.index });
  }
  hits.sort((a, b) => a.index - b.index);
  return hits.map((h, i) => ({
    prefix: h.prefix,
    start: h.index,
    end: i + 1 < hits.length ? hits[i + 1]!.index : safe.length,
  }));
}

function prefixFor(scopes: RouteScope[], index: number): string {
  for (const s of scopes) {
    if (index >= s.start && index < s.end) return s.prefix;
  }
  return '';
}

function joinPath(prefix: string, methodPath: string): string {
  const a = prefix.replace(/\/+$/, '');
  const b = methodPath.replace(/^\/+/, '');
  if (!a && !b) return '/';
  if (!a) return `/${b}`.replace(/\/+/g, '/');
  if (!b) return `/${a}`.replace(/\/+/g, '/') || '/';
  return `/${a}/${b}`.replace(/\/+/g, '/');
}

function methodNameAfter(safe: string, from: number): string | null {
  const slice = safe.slice(from, from + 200);
  const m = slice.match(
    /\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/
  );
  return m ? m[1]! : null;
}
