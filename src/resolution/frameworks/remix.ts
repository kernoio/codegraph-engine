/**
 * Remix / React Router v7 framework-mode route detector (Kerno plugin).
 *
 * Stock `react` only indexes declarative `<Route>` / data-router objects.
 * Framework mode uses `app/routes.ts` + route modules (`loader`/`action`)
 * and/or `@react-router/fs-routes` file conventions — that's what this covers.
 *
 * HTTP endpoints:
 *   - `loader`  → GET  /path
 *   - `action`  → POST /path (plus PUT/PATCH/DELETE when `request.method`
 *                 switch cases are statically visible)
 *
 * UI-only modules (default export, no loader/action) are ignored so SCIP
 * endpoint totals stay handler-shaped (`VERB /path`).
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  FrameworkExtractionResult,
  UnresolvedRef,
  ResolutionContext,
} from '../types';
import { stripCommentsForRegex } from '../strip-comments';
import { filePathToRemixRoute, normalizeRoutePath } from './route-path';
import {
  isRoutesConfigFile,
  parseRoutesConfig,
  resolveRouteModulePath,
} from './routes-config';

const LOADER_RE =
  /\bexport\s+(?:async\s+)?function\s+loader\b|\bexport\s+const\s+loader\s*=|\bexport\s*\{[^}]*\bloader\b/;
const ACTION_RE =
  /\bexport\s+(?:async\s+)?function\s+action\b|\bexport\s+const\s+action\s*=|\bexport\s*\{[^}]*\baction\b/;

const METHOD_CASE_RE = /case\s*['"](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"]/gi;

const FRAMEWORK_DEPS = [
  '@react-router/dev',
  '@react-router/fs-routes',
  '@remix-run/dev',
  '@remix-run/react',
  '@remix-run/node',
  '@remix-run/cloudflare',
  '@remix-run/deno',
  'remix',
];

export const remixResolver: FrameworkResolver = {
  name: 'remix',
  languages: ['javascript', 'typescript', 'tsx', 'jsx'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (FRAMEWORK_DEPS.some((d) => deps[d])) return true;
        // RR library mode alone is not framework mode — require the dev package
        // or Remix runtime. `react-router` without `@react-router/dev` is data-router.
      } catch {
        // fall through
      }
    }

    for (const file of context.getAllFiles()) {
      if (!/(^|\/)routes\.(tsx?|jsx?)$/.test(file)) continue;
      const content = context.readFile(file);
      if (content && isRoutesConfigFile(file, content)) return true;
    }

    // Classic Remix / fs-routes: app/routes modules that import the runtime
    for (const file of context.getAllFiles()) {
      if (!/(?:^|\/)app\/routes\/.+\.(tsx?|jsx?)$/.test(file)) continue;
      const content = context.readFile(file);
      if (
        content &&
        /from\s+['"]react-router['"]|from\s+['"]@remix-run\//.test(content)
      ) {
        return true;
      }
    }
    return false;
  },

  resolve(_ref, _context) {
    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (isRoutesConfigFile(filePath, content)) {
      return { nodes: [], references: [] };
    }

    const routePath = filePathToRemixRoute(filePath);
    if (!routePath) {
      return { nodes: [], references: [] };
    }

    const lang = langFor(filePath);
    const safe = stripCommentsForRegex(content, 'typescript');
    const verbs = collectHttpVerbs(safe);
    if (verbs.length === 0) {
      return { nodes: [], references: [] };
    }

    return emitRoutes(filePath, routePath, verbs, content, lang);
  },

  postExtract(context: ResolutionContext): Node[] {
    const updates: Node[] = [];
    const now = Date.now();

    for (const file of context.getAllFiles()) {
      if (!/(^|\/)routes\.(tsx?|jsx?)$/.test(file)) continue;
      const content = context.readFile(file);
      if (!content || !isRoutesConfigFile(file, content)) continue;

      for (const entry of parseRoutesConfig(content)) {
        const modulePath = resolveRouteModulePath(file, entry.modulePath);
        const urlPath = normalizeRoutePath(entry.urlPath);
        const existing = context.getNodesInFile(modulePath).filter((n) => n.kind === 'route');
        for (const node of existing) {
          const verb = node.name.split(/\s+/)[0];
          if (!verb || !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(verb)) continue;
          const newName = `${verb} ${urlPath}`;
          if (node.name === newName) continue;
          updates.push({ ...node, name: newName, updatedAt: now });
        }
      }
    }

    return updates;
  },
};

function collectHttpVerbs(safe: string): string[] {
  const verbs = new Set<string>();
  if (LOADER_RE.test(safe)) {
    verbs.add('GET');
  }
  // Reset lastIndex — LOADER_RE / ACTION_RE are sticky-less but global flags absent; fine.
  if (ACTION_RE.test(safe)) {
    const methods = new Set<string>();
    let m: RegExpExecArray | null;
    METHOD_CASE_RE.lastIndex = 0;
    while ((m = METHOD_CASE_RE.exec(safe)) !== null) {
      methods.add(m[1]!.toUpperCase());
    }
    if (methods.size > 0) {
      for (const method of methods) {
        if (method !== 'GET') verbs.add(method);
      }
    } else {
      verbs.add('POST');
    }
  }
  return Array.from(verbs);
}

function emitRoutes(
  filePath: string,
  routePath: string,
  verbs: string[],
  content: string,
  lang: Node['language']
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();

  for (const method of verbs) {
    const handlerName = method === 'GET' ? 'loader' : 'action';
    const idx = content.search(
      new RegExp(
        `\\bexport\\s+(?:async\\s+)?(?:function\\s+|const\\s+)${handlerName}\\b|\\bexport\\s*\\{[^}]*\\b${handlerName}\\b`
      )
    );
    const lineNum = idx >= 0 ? content.slice(0, idx).split('\n').length : 1;
    const node: Node = {
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
    };
    nodes.push(node);
    references.push({
      fromNodeId: node.id,
      referenceName: handlerName,
      referenceKind: 'references',
      line: lineNum,
      column: 0,
      filePath,
      language: lang,
    });
  }

  return { nodes, references };
}

function langFor(filePath: string): Node['language'] {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.ts')) return 'typescript';
  return 'javascript';
}
