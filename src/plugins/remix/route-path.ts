/**
 * Remix / React Router framework-mode file → URL path.
 *
 * Covers `@react-router/fs-routes` flat (dot) ids and folder-nested
 * routes (`resources/healthcheck.tsx`, `_auth/login.tsx`). Params are
 * normalized to `{id}` for endpoint naming consistency.
 */

const ROUTE_FILE_RE = /(?:^|\/)routes\/(.+)$/;

/** Colocated / non-route modules under app/routes (epic-stack style). */
const SKIP_ROUTE_FILE_RE =
  /\.(server|client|test|spec)\.|\/\+|\.(css|md|json|png|jpg|svg)$/i;

export function filePathToRemixRoute(filePath: string): string | null {
  const match = filePath.match(ROUTE_FILE_RE);
  if (!match) return null;

  let rel = match[1]!.replace(/\\/g, '/');
  if (SKIP_ROUTE_FILE_RE.test(rel)) return null;
  if (!/\.(tsx?|jsx?)$/.test(rel)) return null;

  if (/\/route\.(tsx?|jsx?)$/.test(rel)) {
    rel = rel.replace(/\/route\.(tsx?|jsx?)$/, '');
  } else {
    rel = rel.replace(/\.(tsx?|jsx?)$/, '');
  }

  if (!rel || rel === 'route') return null;
  // Folder organization with dots: normalize `/` → `.` then decode flat id.
  return flatRouteIdToPath(rel.replace(/\//g, '.'));
}

export function flatRouteIdToPath(routeId: string): string {
  // Escape brackets must survive `.` splitting (`sitemap[.]xml` → `/sitemap.xml`).
  const escapes: string[] = [];
  const tokenized = routeId.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const i = escapes.length;
    escapes.push(inner);
    return `__RRESC${i}__`;
  });

  const segments = tokenized.split('.').filter((s) => s.length > 0);
  const urlParts: string[] = [];

  for (const seg of segments) {
    if (seg === '_index' || seg === 'index') {
      continue;
    }
    // Pathless layout segment (`_auth`, `_marketing`, `_seo`)
    if (seg.startsWith('_')) {
      continue;
    }
    // Trailing underscore opts out of layout nesting but keeps the path segment
    let s = seg.endsWith('_') ? seg.slice(0, -1) : seg;
    s = s.replace(/__RRESC(\d+)__/g, (_, n: string) => escapes[Number(n)] ?? '');

    // Optional segment: ($lang) → {lang}
    const opt = s.match(/^\(([^)]+)\)$/);
    if (opt) {
      s = opt[1]!;
    }

    if (s === '$') {
      urlParts.push('*');
      continue;
    }
    if (s.startsWith('$')) {
      urlParts.push(`{${s.slice(1)}}`);
      continue;
    }
    urlParts.push(s);
  }

  if (urlParts.length === 0) return '/';
  return '/' + urlParts.join('/');
}

/** Normalize React Router path params (`:id`, `*`) to `{id}` / `*`. */
export function normalizeRoutePath(path: string): string {
  if (!path || path === '/') return '/';
  const parts = path.split('/').filter((p) => p.length > 0);
  const normalized = parts.map((p) => {
    if (p === '*') return '*';
    if (p.endsWith('?')) {
      const base = p.slice(0, -1);
      if (base.startsWith(':')) return `{${base.slice(1)}}`;
      return base;
    }
    if (p.startsWith(':')) return `{${p.slice(1)}}`;
    return p;
  });
  return '/' + normalized.join('/');
}

export function joinRoutePaths(base: string, segment: string): string {
  if (!segment) return normalizeRoutePath(base || '/');
  if (!base || base === '/') return normalizeRoutePath(segment);
  return normalizeRoutePath(`${base.replace(/\/$/, '')}/${segment.replace(/^\//, '')}`);
}
