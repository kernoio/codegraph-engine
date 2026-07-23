/**
 * Go HTTP framework plugin tests — fixtures from mattermost, gin-vue-admin,
 * chi, and Fiber (gofiber/recipes + gofiber/boilerplate).
 */

import { describe, expect, it } from 'vitest';
import { goHttpResolver } from '../../src/plugins/go-http/resolver';
import {
  applyMuxRoutePrefixes,
  collectGroupVarPrefixes,
  collectMuxRoutePrefixes,
  extractGoHttpRoutes,
} from '../../src/plugins/go-http/mux-routes';
import { goResolver } from '../../src/resolution/frameworks/go';
import {
  MATTERMOST_USER_ROUTE_REGISTRATIONS,
  MATTERMOST_API_ROUTES_STRUCT,
  GIN_VUE_ADMIN_GROUP_ROUTE,
  CHI_METHODS_ROUTE,
  FIBER_AUTH_JWT_ROUTES,
  FIBER_BOILERPLATE_APP,
  FIBER_ROUTE_CALLBACK_AND_ADD,
} from './fixtures';
import type { Node } from '../../src/types';

describe('go-http plugin (framework: gorilla/mux + Gin + Chi + Fiber)', () => {
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

  it('extracts gin-vue-admin group-var POST/GET with Group prefix joined', () => {
    const result = goHttpResolver.extract!(
      'router/example/exa_customer.go',
      GIN_VUE_ADMIN_GROUP_ROUTE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /customer/customer',
      'POST /customer/customer',
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

  it('extracts Fiber nested Group routes from gofiber/recipes auth-jwt', () => {
    const result = goHttpResolver.extract!('router/router.go', FIBER_AUTH_JWT_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/products/{id}',
      'DELETE /api/users/{id}',
      'GET /api',
      'GET /api/products',
      'GET /api/products/{id}',
      'GET /api/users/{id}',
      'PATCH /api/users/{id}',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/refresh-token',
      'POST /api/auth/register',
      'POST /api/products',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'CreateProduct',
      'DeleteProduct',
      'DeleteUser',
      'GetAllProducts',
      'GetProduct',
      'GetUser',
      'Hello',
      'Login',
      'Logout',
      'RefreshToken',
      'Register',
      'UpdateUser',
    ]);
  });

  it('extracts Fiber boilerplate Group routes and skips static.New', () => {
    const result = goHttpResolver.extract!('app.go', FIBER_BOILERPLATE_APP);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/users',
      'POST /api/v1/users',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'UserCreate',
      'UserList',
    ]);
  });

  it('extracts Fiber Route callback, Add multi-method, and All', () => {
    const prefixes = collectGroupVarPrefixes(FIBER_ROUTE_CALLBACK_AND_ADD);
    expect(prefixes.get('r')).toBe('/api/v1');

    const result = goHttpResolver.extract!('main.go', FIBER_ROUTE_CALLBACK_AND_ADD);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'ANY /ping',
      'GET /api/v1/users',
      'GET /health',
      'POST /api/v1/users',
      'POST /health',
    ]);
  });

  it('detects Go projects via go.mod and ignores non-Go trees', () => {
    expect(
      goHttpResolver.detect!({
        readFile: (f: string) => (f === 'go.mod' ? 'module example.com/app\n' : null),
        getAllFiles: () => ['go.mod', 'main.go'],
      } as never)
    ).toBe(true);
    expect(
      goHttpResolver.detect!({
        readFile: () => null,
        getAllFiles: () => ['package.json', 'src/index.ts'],
      } as never)
    ).toBe(false);
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
