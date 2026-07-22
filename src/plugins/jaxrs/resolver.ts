/**
 * JAX-RS Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from Jakarta/Java EE JAX-RS annotations used by Quarkus,
 * Jersey, RESTEasy, and Dropwizard: class/method `@Path` composed with
 * `@GET` / `@POST` / `@PUT` / `@DELETE` / `@PATCH` / `@HEAD` / `@OPTIONS`.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
const HTTP_ANN_RE = new RegExp(`@(${HTTP_METHODS.join('|')})\\b`, 'g');
const JAVA_KT = /\.(java|kt)$/;

const MANIFEST_MARKERS = [
  'jakarta.ws.rs',
  'javax.ws.rs',
  'jersey-server',
  'jersey-common',
  'resteasy',
  'quarkus-rest',
  'quarkus-resteasy',
  'dropwizard-jersey',
  'org.glassfish.jersey',
  'io.quarkus.resteasy',
];

export const jaxrsResolver: FrameworkResolver = {
  name: 'jaxrs',
  languages: ['java', 'kotlin'],

  detect(context: ResolutionContext): boolean {
    for (const manifest of ['pom.xml', 'build.gradle', 'build.gradle.kts']) {
      const body = context.readFile(manifest);
      if (body && MANIFEST_MARKERS.some((m) => body.includes(m))) {
        return true;
      }
    }

    return context.getAllFiles().some((f) => {
      if (!JAVA_KT.test(f)) return false;
      const content = context.readFile(f);
      return content != null && looksLikeJaxRs(content);
    });
  },

  resolve() {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!JAVA_KT.test(filePath)) {
      return { nodes: [], references: [] };
    }
    if (
      !content.includes('@Path') &&
      !/@(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/.test(content)
    ) {
      return { nodes: [], references: [] };
    }

    const safe = stripCommentsForRegex(content, 'java');
    if (!looksLikeJaxRs(safe)) {
      return { nodes: [], references: [] };
    }

    return extractFromSafe(filePath, safe, filePath.endsWith('.kt') ? 'kotlin' : 'java');
  },
};

function looksLikeJaxRs(content: string): boolean {
  if (/(?:jakarta|javax)\.ws\.rs\b/.test(content)) return true;
  return /@(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/.test(content) && /@Path\b/.test(content);
}

interface ClassScope {
  className: string;
  prefix: string;
  start: number;
  end: number;
}

function extractFromSafe(
  filePath: string,
  safe: string,
  lang: 'java' | 'kotlin'
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const scopes = buildClassScopes(safe);

  HTTP_ANN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTTP_ANN_RE.exec(safe)) !== null) {
    const method = match[1]!;
    const afterStart = match.index + match[0].length;
    const after = safe.slice(afterStart, afterStart + 800);

    // HTTP method annotations decorate resource methods, not types.
    if (
      /^\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|final|abstract|open|data|sealed|static)\s+)*(?:class|interface)\b/.test(
        after
      )
    ) {
      continue;
    }

    const handler = findHandlerName(after);
    if (!handler) continue;

    const scope = scopeFor(scopes, match.index);
    const methodPath = findMethodPath(safe, match.index);
    const routePath = joinPath(scope?.prefix ?? '', methodPath);
    const line = lineAt(safe, match.index);

    const node: Node = {
      id: `route:${filePath}:${line}:${method}:${routePath}`,
      kind: 'route',
      name: `${method} ${routePath}`,
      qualifiedName: `${filePath}::route:${method}:${routePath}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: match[0].length,
      language: lang,
      updatedAt: now,
    };
    nodes.push(node);
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

  return { nodes, references };
}

function buildClassScopes(safe: string): ClassScope[] {
  const scopes: ClassScope[] = [];
  const classRe =
    /(?:(?:public|protected|private|final|abstract|open|data|sealed|static)\s+)*(?:class|interface)\s+([A-Za-z_]\w*)/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(safe)) !== null) {
    const className = cm[1]!;
    const prefix = classPathBefore(safe, cm.index);
    scopes.push({
      className,
      prefix,
      start: cm.index,
      end: safe.length,
    });
  }

  scopes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < scopes.length; i++) {
    scopes[i]!.end = i + 1 < scopes.length ? scopes[i + 1]!.start : safe.length;
  }
  return scopes;
}

function classPathBefore(safe: string, classIndex: number): string {
  const before = safe.slice(Math.max(0, classIndex - 1200), classIndex);
  // Walk annotation stack immediately preceding the type declaration.
  const stack = before.split(/(?=@[\w.]+)/).filter((s) => s.trim().startsWith('@'));
  for (let i = stack.length - 1; i >= 0; i--) {
    const chunk = stack[i]!;
    const m = chunk.match(/^@Path\s*\(([^)]*)\)/);
    if (m) return parsePathArg(m[1]!);
    // Stop once we've left the contiguous annotation block (hit a non-annotation token).
    if (!/^@[\w.]+/.test(chunk.trim())) break;
  }

  // Fallback: last @Path in the pre-class window that is not followed by a method-ish signature.
  const pathRe = /@Path\s*\(([^)]*)\)/g;
  let last = '';
  let pm: RegExpExecArray | null;
  while ((pm = pathRe.exec(before)) !== null) {
    const afterPath = before.slice(pm.index + pm[0].length);
    if (
      /^\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|final|abstract|open|data|sealed|static)\s+)*(?:class|interface)\b/.test(
        afterPath
      )
    ) {
      last = parsePathArg(pm[1]!);
    }
  }
  return last;
}

function findMethodPath(safe: string, verbIndex: number): string {
  const before = safe.slice(Math.max(0, verbIndex - 500), verbIndex);
  const lastBreak = Math.max(
    before.lastIndexOf('}'),
    before.lastIndexOf(';'),
    before.lastIndexOf('{')
  );
  const backRegion = before.slice(lastBreak + 1);

  const after = safe.slice(verbIndex, verbIndex + 800);
  const forwardEnd = after.search(/\b(?:public|private|protected|fun)\b/);
  const forwardRegion = forwardEnd >= 0 ? after.slice(0, forwardEnd) : after.slice(0, 400);

  const region = backRegion + forwardRegion;
  let path = '';
  const pathRe = /@Path\s*\(([^)]*)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = pathRe.exec(region)) !== null) {
    path = parsePathArg(pm[1]!);
  }
  return path;
}

function findHandlerName(after: string): string | null {
  const kotlin = after.match(/\bfun\s+([A-Za-z_]\w*)\s*\(/);
  if (kotlin) return kotlin[1]!;

  const java = after.match(
    /\b(?:public|private|protected)\s+[^;{=]*?\s+([A-Za-z_]\w*)\s*\(/
  );
  if (java) return java[1]!;

  // Package-private Java methods (no visibility modifier).
  const pkg = after.match(
    /^\s*(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:final|static|synchronized|default|native)\s+)*[\w.<>,?\[\]\s]+?\s+([A-Za-z_]\w*)\s*\(/
  );
  return pkg ? pkg[1]! : null;
}

function parsePathArg(args: string): string {
  const m = args.match(/(?:value\s*=\s*)?["']([^"']*)["']/);
  return m ? m[1]! : '';
}

function joinPath(prefix: string, sub: string): string {
  const parts = [prefix, sub]
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
}

function scopeFor(scopes: ClassScope[], index: number): ClassScope | null {
  for (const s of scopes) {
    if (index >= s.start && index < s.end) return s;
  }
  // HTTP ann may sit before the `class` keyword when annotations are ordered
  // unusually; fall back to the nearest following scope.
  for (const s of scopes) {
    if (index < s.start) return s;
  }
  return scopes.length > 0 ? scopes[scopes.length - 1]! : null;
}

function lineAt(safe: string, index: number): number {
  return safe.slice(0, index).split('\n').length;
}
