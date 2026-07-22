/**
 * Go HTTP framework plugin tests — fixtures from mattermost + gin-vue-admin / chi.
 */

import { describe, expect, it } from 'vitest';
import { goHttpResolver } from '../../src/plugins/go-http/resolver';
import {
  applyMuxRoutePrefixes,
  collectMuxRoutePrefixes,
  extractGoHttpRoutes,
} from '../../src/plugins/go-http/mux-routes';
import { getBuiltInPlugins, getBuiltInPluginResolvers } from '../../src/plugins';
import { goResolver } from '../../src/resolution/frameworks/go';
import {
  MATTERMOST_USER_ROUTE_REGISTRATIONS,
  MATTERMOST_API_ROUTES_STRUCT,
  GIN_VUE_ADMIN_GROUP_ROUTE,
  CHI_METHODS_ROUTE,
} from './fixtures';
import type { Node } from '../../src/types';

describe('in-repo plugin registry', () => {
  it('exposes go-http alongside other Kerno built-in plugins', () => {
    const ids = getBuiltInPlugins().map((p) => p.id).sort();
    expect(ids).toContain('kerno-go-http');
    expect(getBuiltInPluginResolvers().map((r) => r.name)).toContain('go');
  });
});

describe('go-http plugin (framework: gorilla/mux + Gin + Chi)', () => {
  it('extracts mattermost subrouter Handle("", h).Methods(http.MethodPost)', () => {
    const result = goHttpResolver.extract!(
      'channels/api4/user.go',
      MATTERMOST_USER_ROUTE_REGISTRATIONS
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'POST /',
      'POST /ids',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'createUser',
      'getUser',
      'getUsersByIds',
    ]);
  });

  it('merges mattermost Routes struct prefixes in postExtract', () => {
    const extracted = extractGoHttpRoutes(
      'channels/api4/user.go',
      MATTERMOST_USER_ROUTE_REGISTRATIONS
    );
    const prefixByField = collectMuxRoutePrefixes(MATTERMOST_API_ROUTES_STRUCT);
    expect(prefixByField.get('Users')).toBe('/users');
    expect(prefixByField.get('User')).toBe('/users/{user_id:[A-Za-z0-9]+}');

    const updated = applyMuxRoutePrefixes(extracted.nodes, prefixByField);
    expect(updated.map((n) => n.name).sort()).toEqual([
      'GET /users/{user_id:[A-Za-z0-9]+}',
      'POST /users',
      'POST /users/ids',
    ]);
  });

  it('extracts gin-vue-admin group-var POST/GET registrations', () => {
    const result = goHttpResolver.extract!(
      'router/example/exa_customer.go',
      GIN_VUE_ADMIN_GROUP_ROUTE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /customer',
      'POST /customer',
    ]);
  });

  it('extracts chi Method / Methods registrations', () => {
    const result = goHttpResolver.extract!('rest.go', CHI_METHODS_ROUTE);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /articles/{articleID}',
      'GET /search',
      'POST /search',
    ]);
  });

  it('does NOT treat verb-named non-path calls as routes (#1259)', () => {
    const src = [
      `c.Put("a", 1)`,
      `store.Get("config", out)`,
      `bus.Handle("user.created", onUserCreated)`,
      `m.HandleFunc("shutdown", hook)`,
    ].join('\n');
    const { nodes } = goHttpResolver.extract!('cache.go', src);
    expect(nodes).toHaveLength(0);
  });

  it('frameworks/go re-exports the plugin resolver', () => {
    expect(goResolver.extract).toBe(goHttpResolver.extract);
  });
});

describe('go-http postExtract integration', () => {
  it('rewrites mux routes using Routes struct comments from sibling files', () => {
    const extracted = extractGoHttpRoutes(
      'channels/api4/user.go',
      MATTERMOST_USER_ROUTE_REGISTRATIONS
    );

    const ctx = {
      getAllFiles: () => ['channels/api4/api.go', 'channels/api4/user.go'],
      readFile: (f: string) =>
        f === 'channels/api4/api.go' ? MATTERMOST_API_ROUTES_STRUCT : null,
      iterateNodesByKind: function* (kind: string) {
        if (kind === 'route') yield* extracted.nodes;
      },
    };

    const updates = goHttpResolver.postExtract!(ctx as never);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some((n: Node) => n.name.startsWith('POST /users'))).toBe(true);
  });
});
