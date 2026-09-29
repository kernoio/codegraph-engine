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
  finalizeGoRouteNames,
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
  GITEA_API_MOUNT,
  GITEA_NESTED_GROUP_ROUTES,
  CHI_NESTED_ROUTE_CALLBACKS,
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
    expect(prefixByField.get('Users')).toBe('/api/v4/users');
    expect(prefixByField.get('User')).toBe('/api/v4/users/{user_id:[A-Za-z0-9]+}');

    const updated = applyMuxRoutePrefixes(extracted.nodes, prefixByField);
    expect(updated.map((n) => n.name).sort()).toEqual([
      'GET /api/v4/users/{user_id:[A-Za-z0-9]+}',
      'POST /api/v4/users',
      'POST /api/v4/users/ids',
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

  it('keeps nested Gitea Group prefixes, Combo methods, helpers, and regexp params', () => {
    const result = goHttpResolver.extract!(
      'routers/api/v1/api.go',
      GITEA_NESTED_GROUP_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /repos/{username}/{reponame}',
      'GET /licenses',
      'GET /orgs/{org}/projects',
      'GET /orgs/{org}/projects/{id}',
      'GET /orgs/{org}/projects/{id}/columns',
      'GET /repos/search',
      'GET /repos/{username}/{reponame}',
      'GET /repos/{username}/{reponame}/actions/artifacts/{artifact_id}/zip/raw',
      'GET /repos/{username}/{reponame}/{ball_type:tarball|zipball|bundle}/*',
      'GET /user/projects',
      'GET /user/projects/{id}',
      'GET /user/projects/{id}/columns',
      'GET /version',
      'HEAD /repos/{username}/{reponame}/{ball_type:tarball|zipball|bundle}/*',
      'PATCH /repos/{username}/{reponame}',
      'POST /repos/{username}/{reponame}/transfer/accept',
      'POST /repos/{username}/{reponame}/transfer/reject',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('AcceptTransfer');
    expect(result.references.map((r) => r.referenceName)).toContain('Get');
  });

  it('applies a cross-file Mount prefix onto the mounted router function', () => {
    const extracted = extractGoHttpRoutes('routers/api/v1/api.go', GITEA_NESTED_GROUP_ROUTES);
    const ctx = {
      getAllFiles: () => ['go.mod', 'routers/init.go', 'routers/api/v1/api.go'],
      readFile: (f: string) => {
        if (f === 'go.mod') return 'module example.com/gitea\n\ngo 1.22\n';
        if (f === 'routers/init.go') return GITEA_API_MOUNT;
        if (f === 'routers/api/v1/api.go') return GITEA_NESTED_GROUP_ROUTES;
        return null;
      },
      iterateNodesByKind: function* (kind: string) {
        if (kind === 'route') yield* extracted.nodes;
      },
    };
    const updates = goHttpResolver.postExtract!(ctx as never);
    const names = new Map(extracted.nodes.map((n) => [n.id, n.name]));
    for (const update of updates) names.set(update.id, update.name);
    expect([...names.values()].sort()).toEqual([
      'DELETE /api/v1/repos/{username}/{reponame}',
      'GET /api/v1/licenses',
      'GET /api/v1/orgs/{org}/projects',
      'GET /api/v1/orgs/{org}/projects/{id}',
      'GET /api/v1/orgs/{org}/projects/{id}/columns',
      'GET /api/v1/repos/search',
      'GET /api/v1/repos/{username}/{reponame}',
      'GET /api/v1/repos/{username}/{reponame}/actions/artifacts/{artifact_id}/zip/raw',
      'GET /api/v1/repos/{username}/{reponame}/{ball_type:tarball|zipball|bundle}/*',
      'GET /api/v1/user/projects',
      'GET /api/v1/user/projects/{id}',
      'GET /api/v1/user/projects/{id}/columns',
      'GET /api/v1/version',
      'HEAD /api/v1/repos/{username}/{reponame}/{ball_type:tarball|zipball|bundle}/*',
      'PATCH /api/v1/repos/{username}/{reponame}',
      'POST /api/v1/repos/{username}/{reponame}/transfer/accept',
      'POST /api/v1/repos/{username}/{reponame}/transfer/reject',
    ]);
  });

  it('keeps chi Route prefixes when the callback parameter shadows the parent', () => {
    const result = goHttpResolver.extract!('routes.go', CHI_NESTED_ROUTE_CALLBACKS);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/health',
      'GET /api/ping',
      'GET /api/v1/users',
      'GET /public',
    ]);
  });

  it('applies the call-site group prefix to a closure that closes over the router', () => {
    const src = `
func register(m *web.Router) {
	addSecrets := func() {
		m.Group("/secrets", func() {
			m.Get("", listSecrets)
			m.Post("", createSecret)
		})
	}
	m.Group("/user/settings", func() {
		m.Group("/actions", func() {
			addSecrets()
		})
	})
	m.Group("/repo/settings", func() {
		addSecrets()
	})
}
`;
    const result = goHttpResolver.extract!('web.go', src);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /repo/settings/secrets',
      'GET /user/settings/actions/secrets',
      'POST /repo/settings/secrets',
      'POST /user/settings/actions/secrets',
    ]);
  });

  it('does not let one function\'s Group variable overwrite another\'s', () => {
    const src = `
func a(app *gin.Engine) {
	r := app.Group("/a")
	r.GET("/x", ax)
}
func b(app *gin.Engine) {
	r := app.Group("/b")
	r.GET("/y", by)
}
`;
    const result = goHttpResolver.extract!('routes.go', src);
    expect(result.nodes.map((n) => n.name).sort()).toEqual(['GET /a/x', 'GET /b/y']);
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
    expect(updates.some((n: Node) => n.name.startsWith('POST /api/v4/users'))).toBe(true);
  });

  it('composes mux PathPrefix chains when no struct comment documents the field', () => {
    const src = `
package api

const APIURLSuffix = "/api/v4"

func Init() {
	api.BaseRoutes.APIRoot = srv.Router.PathPrefix(APIURLSuffix).Subrouter()
	api.BaseRoutes.Users = api.BaseRoutes.APIRoot.PathPrefix("/users").Subrouter()
	api.BaseRoutes.User = api.BaseRoutes.Users.PathPrefix("/{user_id}").Subrouter()
}
`;
    const prefixes = collectMuxRoutePrefixes(src);
    expect(prefixes.get('APIRoot')).toBe('/api/v4');
    expect(prefixes.get('Users')).toBe('/api/v4/users');
    expect(prefixes.get('User')).toBe('/api/v4/users/{user_id}');
  });

  it('keeps the literal half of a computed Gin group prefix', () => {
    const src = `
func setup(r *gin.Engine, base string) {
	v1 := r.Group(base + "/api/v1")
	v1.GET("/users", listUsers)
	admin := v1.Group("/admin")
	admin.GET("/stats", stats)
}
`;
    const result = goHttpResolver.extract!('router.go', src);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/admin/stats',
      'GET /api/v1/users',
    ]);
  });

  it('resolves a group prefix from a const in another file and from the call site', () => {
    const constants = `
package constants

const APIPrefix = "/api/v4"
`;
    const router = `
package routers

import "example.com/app/application/constants"

func Init(r *gin.Engine) {
	v4 := r.Group(constants.APIPrefix)
	v4.GET("/site", siteInfo)
	auth := r.Group("/answer/api/v1")
	register(auth)
}

func register(r *gin.RouterGroup) {
	r.GET("/user/info", userInfo)
}
`;
    const other = `
package router

func RegisterAnswerAPIRouter(r *gin.RouterGroup) {
	r.GET("/siteinfo", getSiteInfo)
}
`;
    const http = `
package server

func routes(r *gin.Engine) {
	authV1 := r.Group(uiConf.APIBaseURL + "/answer/api/v1")
	answerRouter.RegisterAnswerAPIRouter(authV1)
}
`;
    const extracted = [
      ...extractGoHttpRoutes('routers/router.go', router).nodes,
      ...extractGoHttpRoutes('router/api.go', other).nodes,
    ];
    const ctx = {
      getAllFiles: () => [
        'go.mod',
        'application/constants/constants.go',
        'routers/router.go',
        'router/api.go',
        'server/http.go',
      ],
      readFile: (f: string) => {
        if (f === 'go.mod') return 'module example.com/app\n';
        if (f === 'application/constants/constants.go') return constants;
        if (f === 'routers/router.go') return router;
        if (f === 'router/api.go') return other;
        if (f === 'server/http.go') return http;
        return null;
      },
      iterateNodesByKind: function* (kind: string) {
        if (kind === 'route') yield* extracted;
      },
    };
    const updates = goHttpResolver.postExtract!(ctx as never);
    const names = new Map(extracted.map((n) => [n.id, n.name]));
    for (const update of updates) names.set(update.id, update.name);
    expect([...names.values()].sort()).toEqual([
      'GET /answer/api/v1/siteinfo',
      'GET /answer/api/v1/user/info',
      'GET /api/v4/site',
    ]);
  });

  it('leaves GoFrame g.Meta routes alone when composing mux and Mount prefixes', () => {
    const foreign: Node = {
      id: 'route:api/system/dept.go:6:GET:/dept/list',
      kind: 'route',
      name: 'GET /dept/list',
      qualifiedName: 'api/system/dept.go::goframe-route:system.DeptSearchReq',
      filePath: 'api/system/dept.go',
      startLine: 6,
      endLine: 6,
      startColumn: 0,
      endColumn: 10,
      language: 'go',
      updatedAt: 0,
    };
    expect(finalizeGoRouteNames([foreign], new Map([['Users', '/api/v4']]), new Map())).toEqual([]);
  });
});
