/**
 * Micronaut Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from `@Controller` + `@Get/@Post/@Put/@Patch/@Delete/
 * @Head/@Options/@Trace` (io.micronaut.http.annotation.*).
 *
 * Covers Java and Kotlin. Class-level `@Controller("/prefix")` is joined onto
 * each method path. Bare `@Get` / `@Get()` default to `/`. Named `uri=` /
 * `value=` / `uris=` arguments are honored; `produces`/`consumes` alone do not
 * invent a path.
 *
 * Known gaps (left uncovered — precision over recall):
 * - Programmatic `RouteBuilder` / `DefaultRouteBuilder` registration
 * - `@CustomHttpMethod` non-standard verbs
 * - Controller path string templates (`@Controller("${CONST}/x")`)
 * - Cross-file interface annotations inherited by `@Controller` implementors
 *   (e.g. method `@Post` on an API interface, prefix on the implementing class)
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  FrameworkExtractionResult,
  ResolutionContext,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'Trace'];
const HTTP_ANNOTATION_RE = new RegExp(`@(?:${HTTP_METHODS.join('|')})\\b`);
const MICRONAUT_HTTP_IMPORT =
  /io\.micronaut\.http\.annotation\.(?:Controller|Get|Post|Put|Patch|Delete|Head|Options|Trace)\b/;
const MICRONAUT_SIGNAL =
  /io\.micronaut\b|@Controller\s*\(|@(?:Get|Post|Put|Patch|Delete|Head|Options|Trace)\b/;

const MANIFEST_FILES = [
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
];

export const micronautResolver: FrameworkResolver = {
  name: 'micronaut',
  languages: ['java', 'kotlin'],

  detect(context: ResolutionContext): boolean {
    for (const file of MANIFEST_FILES) {
      const content = context.readFile(file);
      if (content && /io\.micronaut|micronaut-/.test(content)) return true;
    }

    // Nested Gradle/Maven modules (Kestra, multi-module POCs).
    for (const file of context.getAllFiles()) {
      const base = file.split('/').pop() ?? '';
      if (
        (base === 'pom.xml' ||
          base === 'build.gradle' ||
          base === 'build.gradle.kts') &&
        /io\.micronaut|micronaut-/.test(context.readFile(file) ?? '')
      ) {
        return true;
      }
    }

    for (const file of context.getAllFiles()) {
      if (!file.endsWith('.java') && !file.endsWith('.kt')) continue;
      const content = context.readFile(file);
      if (content && MICRONAUT_HTTP_IMPORT.test(content)) return true;
    }

    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.java') && !filePath.endsWith('.kt')) {
      return { nodes: [], references: [] };
    }
    if (!MICRONAUT_SIGNAL.test(content) && !HTTP_ANNOTATION_RE.test(content)) {
      return { nodes: [], references: [] };
    }
    // Require a Micronaut HTTP import (or package) so Spring `@Controller`
    // classes never get Micronaut `@Get` treatment if both somehow coexist.
    if (
      !MICRONAUT_HTTP_IMPORT.test(content) &&
      !content.includes('io.micronaut.http.annotation')
    ) {
      return { nodes: [], references: [] };
    }

    const lang: 'java' | 'kotlin' = filePath.endsWith('.kt') ? 'kotlin' : 'java';
    const safe = stripCommentsForRegex(content, 'java');
    return extractFromSafe(filePath, safe, lang);
  },
};

interface ControllerScope {
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
  const scopes = buildControllerScopes(safe);

  for (const hit of findHttpAnnotations(safe)) {
    const scope = scopeFor(scopes, hit.index);
    // Only emit routes inside a `@Controller` type — bare interface method
    // annotations without a controller prefix are left as a known gap rather
    // than inventing `POST /` noise.
    if (!scope) continue;

    const method = hit.name.toUpperCase();
    const paths = parseUriPaths(hit.args);
    const handler = methodNameAfter(safe, hit.end, lang);
    const line = lineAt(safe, hit.index);

    for (const sub of paths) {
      const routePath = joinPath(scope.prefix, sub);
      const node: Node = {
        id: `route:${filePath}:${line}:${method}:${routePath}`,
        kind: 'route',
        name: `${method} ${routePath}`,
        qualifiedName: `${filePath}::route:${method}:${routePath}`,
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
  }

  return { nodes, references };
}

interface AnnotationHit {
  name: string;
  args: string | null;
  index: number;
  end: number;
  length: number;
}

function findHttpAnnotations(safe: string): AnnotationHit[] {
  const hits: AnnotationHit[] = [];
  const re = new RegExp(`@(${HTTP_METHODS.join('|')})\\b(\\s*\\()?`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const name = m[1]!;
    const hasParen = Boolean(m[2] && m[2].includes('('));
    if (!hasParen) {
      hits.push({
        name,
        args: null,
        index: m.index,
        end: m.index + m[0].length,
        length: m[0].length,
      });
      continue;
    }
    const openIndex = m.index + m[0].length - 1;
    const parsed = readArgs(safe, openIndex);
    if (!parsed) continue;
    hits.push({
      name,
      args: parsed.args,
      index: m.index,
      end: parsed.end,
      length: parsed.end - m.index,
    });
    re.lastIndex = parsed.end;
  }
  return hits;
}

function buildControllerScopes(safe: string): ControllerScope[] {
  const scopes: ControllerScope[] = [];
  const re = /@Controller\b(\s*\()?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    let end = m.index + m[0].length;
    let args: string | null = null;
    if (m[1] && m[1].includes('(')) {
      const openIndex = m.index + m[0].length - 1;
      const parsed = readArgs(safe, openIndex);
      if (!parsed) continue;
      args = parsed.args;
      end = parsed.end;
      re.lastIndex = end;
    }
    // Confirm a type declaration follows (skip stacked annotations / modifiers).
    const after = safe.slice(end, end + 800);
    if (
      !/^\s*(?:@[\w.]+(?:\s*\([^)]*\))?\s*)*(?:public\s+|protected\s+|private\s+|final\s+|abstract\s+|open\s+|sealed\s+)*(?:class|interface)\b/.test(
        after
      )
    ) {
      continue;
    }
    const prefix = parseControllerPrefix(args);
    scopes.push({ prefix, start: m.index, end: safe.length });
  }

  scopes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < scopes.length; i++) {
    scopes[i]!.end = i + 1 < scopes.length ? scopes[i + 1]!.start : safe.length;
  }
  return scopes;
}

function scopeFor(scopes: ControllerScope[], index: number): ControllerScope | null {
  for (const s of scopes) {
    if (index >= s.start && index < s.end) return s;
  }
  return null;
}

function parseControllerPrefix(args: string | null): string {
  if (args == null) return '/';
  const paths = parseUriPaths(args);
  return paths[0] ?? '/';
}

/** Resolve one or more URI templates from annotation args. */
function parseUriPaths(args: string | null): string[] {
  if (args == null || args.trim() === '') return ['/'];

  const urisBlock = args.match(/\buris\s*=\s*\{([^}]*)\}/);
  if (urisBlock) {
    const found = [...urisBlock[1]!.matchAll(/["']([^"']*)["']/g)].map((m) => m[1]!);
    if (found.length > 0) return found.map(normalizePathToken);
  }

  const named = args.match(/\b(?:uri|value)\s*=\s*["']([^"']*)["']/);
  if (named) return [normalizePathToken(named[1]!)];

  // Positional / first string that looks like a path (not a media type).
  for (const m of args.matchAll(/["']([^"']*)["']/g)) {
    const s = m[1]!;
    if (looksLikeMediaType(s)) continue;
    if (looksLikePath(s)) return [normalizePathToken(s)];
  }

  return ['/'];
}

function looksLikeMediaType(s: string): boolean {
  return /^(application|text|audio|video|multipart|image)\//i.test(s) || s.includes('*/*');
}

function looksLikePath(s: string): boolean {
  if (s.startsWith('/') || s.startsWith('{')) return true;
  // Relative Micronaut templates: `services/{id}`, `{tenant}/usages/all`
  if (/^[\w{}.+/-]+$/.test(s) && !looksLikeMediaType(s)) return true;
  return false;
}

function normalizePathToken(s: string): string {
  const t = s.trim();
  return t.length === 0 ? '/' : t;
}

function joinPath(prefix: string, sub: string): string {
  const subNorm = sub.trim() === '/' ? '' : sub.trim();
  const parts = [prefix, subNorm]
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
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
    if (ch === '"' || ch === "'") {
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

function methodNameAfter(safe: string, start: number, lang: 'java' | 'kotlin'): string | null {
  let i = start;
  const limit = Math.min(safe.length, start + 800);
  const ws = /\s*/y;
  const decoName = /@[\w.]+/y;
  const modifier =
    /(?:public|private|protected|static|final|synchronized|default|abstract|native|strictfp|override|open|suspend|inline|tailrec)\b/y;

  const eatWs = (): void => {
    ws.lastIndex = i;
    if (ws.exec(safe)) i = ws.lastIndex;
  };

  // Skip stacked annotations between the HTTP mapping and the method.
  for (;;) {
    if (i >= limit) return null;
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

  if (lang === 'kotlin') {
    eatWs();
    const funRe = /fun\s+(\w+)\s*\(/y;
    funRe.lastIndex = i;
    const km = funRe.exec(safe);
    return km ? km[1]! : null;
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
  // Java: return type (possibly generic) then method name.
  const javaMethod =
    /(?:[\w.]+\s*(?:<[^>;{]*>)?\s*(?:\[\s*\])?\s+)+(\w+)\s*\(/y;
  javaMethod.lastIndex = i;
  const jm = javaMethod.exec(safe);
  if (!jm) return null;
  const name = jm[1]!;
  if (/^(if|for|while|switch|catch|return|new|class|interface|enum|record|throws)$/.test(name)) {
    return null;
  }
  return name;
}

function lineAt(safe: string, index: number): number {
  return safe.slice(0, index).split('\n').length;
}
