/**
 * Next.js App Router path helpers (Kerno plugin).
 *
 * Product rule — page UI routes vs HTTP Route Handlers (issue #8):
 *
 * - **Page UI routes** (`app/.../page.tsx`) are emitted by stock `react` as
 *   `kind: route`, `name: "/path"` (no HTTP verb). They are navigation targets,
 *   not HTTP endpoints, and are excluded from SCIP-comparable endpoint totals.
 * - **HTTP Route Handlers** (`app/.../route.ts`) are emitted by this plugin as
 *   `kind: route`, `name: "METHOD /path"`. Endpoint / SCIP benchmarks count
 *   these only (see `isNextHttpRouteHandler`).
 *
 * Both coexist in the graph; consumers must not sum all `kind: route` nodes for
 * Next.js endpoint analysis — that double-counts UI pages (~69 on formbricks)
 * on top of HTTP handlers (~103 SCIP).
 */

/** Logical tag for HTTP handler routes (used by helpers; not persisted on nodes). */
export const NEXT_ROUTE_KIND_HTTP = 'http-handler' as const;

/** Logical tag for App Router page UI routes (used by helpers; not persisted). */
export const NEXT_ROUTE_KIND_PAGE = 'page' as const;

const HTTP_METHOD_PREFIX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;

/** True when a route node is a Next.js App Router HTTP Route Handler. */
export function isNextHttpRouteHandler(node: {
  kind: string;
  name: string;
  qualifiedName?: string;
}): boolean {
  if (node.kind !== 'route') return false;
  if (HTTP_METHOD_PREFIX.test(node.name)) return true;
  // Plugin qualifiedName embeds the verb: `file.ts::route:GET:/api/x`
  return node.qualifiedName?.includes('::route:GET:') === true ||
    node.qualifiedName?.includes('::route:POST:') === true ||
    node.qualifiedName?.includes('::route:PUT:') === true ||
    node.qualifiedName?.includes('::route:PATCH:') === true ||
    node.qualifiedName?.includes('::route:DELETE:') === true ||
    node.qualifiedName?.includes('::route:HEAD:') === true ||
    node.qualifiedName?.includes('::route:OPTIONS:') === true;
}

/** True when a route node is a Next.js App Router page UI route. */
export function isNextPageRoute(node: {
  kind: string;
  name: string;
  qualifiedName?: string;
}): boolean {
  if (node.kind !== 'route') return false;
  if (isNextHttpRouteHandler(node)) return false;
  // App/page routes: "/path" with page qualifiedName (no METHOD segment).
  return node.name.startsWith('/') && !HTTP_METHOD_PREFIX.test(node.name);
}

/**
 * Map `app/.../route.ts` or `app/.../page.tsx` file path to a URL path.
 * Strips Next.js route groups `(segment)` and maps `[param]` → `:param`.
 */
export function filePathToAppRoute(filePath: string, segment: 'route' | 'page'): string | null {
  if (!/(?:^|\/)app\//.test(filePath)) return null;

  const segmentPattern =
    segment === 'route' ? /\/route\.(tsx?|jsx?)$/ : /\/page\.(tsx?|jsx?)$/;
  if (!segmentPattern.test(filePath)) return null;

  let route = filePath
    .replace(/^.*app\//, '/')
    .replace(segment === 'route' ? /\/route\.(tsx?|jsx?)$/ : /\/page\.(tsx?|jsx?)$/, '')
    .replace(/\/\([^/]+\)/g, '')
    .replace(/\[([^\]]+)\]/g, ':$1');

  if (route === '') route = '/';
  return route;
}
