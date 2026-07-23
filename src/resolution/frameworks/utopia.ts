/**
 * Utopia / Appwrite Platform HTTP route detection.
 *
 * Covers Utopia `Http::` / `App::` fluent routes and Appwrite Platform
 * `setHttpMethod` + `setHttpPath` chains (not Laravel Route::).
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';

const HTTP_VERBS = 'get|post|put|patch|delete|options|head|any';

const UTOPIA_METHOD_MAP: Record<string, string> = {
  HTTP_REQUEST_METHOD_GET: 'GET',
  HTTP_REQUEST_METHOD_POST: 'POST',
  HTTP_REQUEST_METHOD_PUT: 'PUT',
  HTTP_REQUEST_METHOD_PATCH: 'PATCH',
  HTTP_REQUEST_METHOD_DELETE: 'DELETE',
  HTTP_REQUEST_METHOD_OPTIONS: 'OPTIONS',
  HTTP_REQUEST_METHOD_HEAD: 'HEAD',
};

export const utopiaResolver: FrameworkResolver = {
  name: 'utopia',
  languages: ['php'],

  detect(context: ResolutionContext): boolean {
    const composer = context.readFile('composer.json');
    if (composer) {
      try {
        const pkg = JSON.parse(composer);
        const deps = { ...(pkg.require ?? {}), ...(pkg['require-dev'] ?? {}) };
        if (
          deps['utopia-php/http'] ||
          deps['utopia-php/framework'] ||
          deps['appwrite/server'] ||
          deps['utopia-php/platform']
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.php')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return (
        new RegExp(`\\b(?:Http|App)::(?:${HTTP_VERBS})\\s*\\(`).test(content) ||
        /->setHttpPath\s*\(\s*['"]/.test(content) ||
        new RegExp(`\\$utopia->(?:${HTTP_VERBS})\\s*\\(`).test(content)
      );
    });
  },

  resolve() {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.php')) return { nodes: [], references: [] };
    const nodes: Node[] = [];
    const now = Date.now();
    const safe = stripCommentsForRegex(content, 'php');
    extractUtopiaRoutes(filePath, safe, now, nodes);
    extractPlatformRoutes(filePath, safe, now, nodes);
    return { nodes, references: [] };
  },
};

function extractUtopiaRoutes(
  filePath: string,
  safe: string,
  now: number,
  nodes: Node[]
): void {
  const utopiaRegex = new RegExp(
    `\\b(?:Http|App)::(${HTTP_VERBS})\\s*\\(\\s*['"]([^'"]+)['"]`,
    'g'
  );
  let match: RegExpExecArray | null;
  while ((match = utopiaRegex.exec(safe)) !== null) {
    const [, method, routePath] = match;
    const line = lineAt(safe, match.index);
    nodes.push(makeRouteNode(filePath, line, method!.toUpperCase(), routePath!, match[0].length, now));
  }

  const legacyRegex = new RegExp(
    `\\$utopia->(${HTTP_VERBS})\\s*\\(\\s*['"]([^'"]+)['"]`,
    'g'
  );
  while ((match = legacyRegex.exec(safe)) !== null) {
    const [, method, routePath] = match;
    const line = lineAt(safe, match.index);
    nodes.push(makeRouteNode(filePath, line, method!.toUpperCase(), routePath!, match[0].length, now));
  }
}

function extractPlatformRoutes(
  filePath: string,
  safe: string,
  now: number,
  nodes: Node[]
): void {
  const pathRe = /->setHttpPath\s*\(\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pathRe.exec(safe)) !== null) {
    const routePath = match[1]!;
    const line = lineAt(safe, match.index);
    const windowStart = Math.max(0, match.index - 600);
    const before = safe.slice(windowStart, match.index);
    const method = parsePlatformHttpMethod(before) ?? 'GET';
    nodes.push(makeRouteNode(filePath, line, method, routePath, match[0].length, now));
  }
}

function parsePlatformHttpMethod(before: string): string | null {
  const m = before.match(
    /->setHttpMethod\s*\(\s*(?:Action::|[^)]*::)?(HTTP_REQUEST_METHOD_\w+)/
  );
  if (!m) return null;
  return UTOPIA_METHOD_MAP[m[1]!] ?? null;
}

function makeRouteNode(
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  colLen: number,
  now: number
): Node {
  return {
    id: `route:${filePath}:${line}:${method}:${routePath}`,
    kind: 'route',
    name: `${method} ${routePath}`,
    qualifiedName: `${filePath}::route:${routePath}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: colLen,
    language: 'php',
    updatedAt: now,
  };
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
