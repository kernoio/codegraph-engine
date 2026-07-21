/**
 * Next.js App Router Route Handlers (Kerno in-repo plugin)
 *
 * Stock upstream `react` indexes App Router page UI files only (`page.tsx`).
 * This plugin adds HTTP Route Handlers under `app/.../route.ts`:
 *   - `export async function GET`
 *   - `export const GET = …`
 *   - `export { GET, POST } from '…'`
 *
 * Only files under an `app/` segment are indexed — implementation modules such
 * as `modules/.../route.ts` (formbricks-style) are intentionally excluded so
 * thin `app/api/.../route.ts` re-exports are not double-counted.
 *
 * See `route-path.ts` for the page-vs-handler product rule and SCIP alignment.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  FrameworkExtractionResult,
} from '../../resolution/types';
import {
  filePathToAppRoute,
} from './route-path';

const HTTP_ROUTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const nextAppRouterResolver: FrameworkResolver = {
  name: 'next-app-router',
  languages: ['javascript', 'typescript', 'tsx', 'jsx'],

  detect(context) {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) return true;
      } catch {
        // ignore
      }
    }
    return context.getAllFiles().some((f) => /(?:^|\/)app\/.+\/route\.(tsx?|jsx?)$/.test(f));
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!/(?:^|\/)route\.(tsx?|jsx?)$/.test(filePath)) {
      return { nodes: [], references: [] };
    }
    const routePath = filePathToAppRoute(filePath, 'route');
    if (!routePath) {
      return { nodes: [], references: [] };
    }

    const httpExports = collectHttpRouteExports(content);
    if (httpExports.length === 0) {
      return { nodes: [], references: [] };
    }

    const lang = filePath.endsWith('.tsx')
      ? 'tsx'
      : filePath.endsWith('.ts')
        ? 'typescript'
        : filePath.endsWith('.jsx')
          ? 'jsx'
          : 'javascript';
    const now = Date.now();
    const nodes: Node[] = [];

    for (const method of httpExports) {
      const line = content.search(
        new RegExp(
          `\\bexport\\s+(?:async\\s+)?(?:function\\s+|const\\s+)${method}\\b|\\bexport\\s*\\{[^}]*\\b${method}\\b`
        )
      );
      const lineNum = line >= 0 ? content.slice(0, line).split('\n').length : 1;
      nodes.push({
        id: `route:${filePath}:${routePath}:${method}:${lineNum}`,
        kind: 'route',
        name: `${method} ${routePath}`,
        qualifiedName: `${filePath}::route:${method}:${routePath}`,
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        startColumn: 0,
        endColumn: 0,
        language: lang,
        updatedAt: now,
      });
    }

    return { nodes, references: [] };
  },
};

function collectHttpRouteExports(content: string): string[] {
  const found = new Set<string>();
  const fnOrConst = new RegExp(
    `\\bexport\\s+(?:async\\s+)?(?:function\\s+|const\\s+)(${HTTP_ROUTE_METHODS.join('|')})\\b`,
    'g'
  );
  let m: RegExpExecArray | null;
  while ((m = fnOrConst.exec(content)) !== null) {
    found.add(m[1]!);
  }
  const reExport = /\bexport\s*\{([^}]+)\}/g;
  while ((m = reExport.exec(content)) !== null) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name && (HTTP_ROUTE_METHODS as readonly string[]).includes(name)) {
        found.add(name);
      }
    }
  }
  return Array.from(found);
}
