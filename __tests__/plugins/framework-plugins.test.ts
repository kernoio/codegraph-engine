/**
 * Framework plugin tests — fixtures cited from real OSS repositories
 * (2+ sources per framework) to prove detectors are framework-level, not
 * repo-specific.
 */

import { describe, expect, it } from 'vitest';
import { tsoaResolver } from '../../src/plugins/tsoa/resolver';
import { nextAppRouterResolver } from '../../src/plugins/next-app-router/resolver';
import { nestjsKernoResolver } from '../../src/plugins/nestjs-kerno/resolver';
import { phpHttpRoutesResolver } from '../../src/plugins/php-http-routes/resolver';
import { hapiResolver } from '../../src/plugins/hapi/resolver';
import { expressResolver } from '../../src/resolution/frameworks/express';
import {
  isNextHttpRouteHandler,
  isNextPageRoute,
  filePathToAppRoute,
} from '../../src/plugins/next-app-router/route-path';
import { reactResolver } from '../../src/resolution/frameworks/react';
import { getBuiltInPlugins, getBuiltInPluginResolvers } from '../../src/plugins';
import {
  LIGHTHASH_SSH_CONTROLLER,
  TSOA_OFFICIAL_GET_CONTROLLER,
  TSOA_OFFICIAL_ROOT_CONTROLLER,
  TSOA_INHERITED_ROUTE_CONTROLLER,
  LIGHTDASH_MULTI_ROUTE_FILE,
  FORMBRICKS_HEALTH_ROUTE_REEXPORT,
  CALCOM_SIGNUP_ROUTE_CONST,
  TAXONOMY_POSTS_ROUTE_FUNCTION,
  NOVU_WIDGETS_CONTROLLER,
  TWENTY_HEALTH_CONTROLLER,
  TWENTY_OBJECT_METADATA_RESOLVER,
  NEST_VERSIONED_CONTROLLER,
  APPWRITE_LOCALE_ROUTES,
  APPWRITE_PLATFORM_VCS_CREATE,
  FIREFLY_PASSPORT_ROUTES,
  HAPI_CLEAN_ARCH_USERS,
  HAPI_FRAME_LOGIN,
  HAPI_SPARKJOKE_ROUTES,
  HAPI_METHOD_ARRAY_AND_PREFIX,
} from './fixtures';

describe('in-repo plugin registry', () => {
  it('exposes all Kerno built-in framework plugins', () => {
    const ids = getBuiltInPlugins().map((p) => p.id).sort();
    expect(ids).toEqual([
      'kerno-go-http',
      'kerno-hapi',
      'kerno-nestjs',
      'kerno-next-app-router',
      'kerno-php-http-routes',
      'kerno-tsoa',
    ]);
    expect(getBuiltInPluginResolvers().map((r) => r.name).sort()).toEqual([
      'go',
      'hapi',
      'laravel',
      'nestjs',
      'next-app-router',
      'tsoa',
    ]);
  });

  it('plugin nestjs replaces stock resolver in registry', () => {
    const names = getBuiltInPluginResolvers().map((r) => r.name);
    expect(names.filter((n) => n === 'nestjs')).toHaveLength(1);
    expect(nestjsKernoResolver.postExtract).toBeDefined();
  });
});

describe('tsoa plugin (framework: tsoa)', () => {
  it('extracts lightdash SshController (@tsoa/runtime)', () => {
    const result = tsoaResolver.extract!(
      'packages/backend/src/controllers/sshController.ts',
      LIGHTHASH_SSH_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['POST /api/v1/ssh/key-pairs']);
  });

  it('extracts lukeautry/tsoa GetTestController', () => {
    const result = tsoaResolver.extract!(
      'tests/fixtures/controllers/getController.ts',
      TSOA_OFFICIAL_GET_CONTROLLER
    );
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['GET /GetTest', 'GET /GetTest/{id}']);
  });

  it('extracts lukeautry/tsoa RootController (@Route() + @Get())', () => {
    const result = tsoaResolver.extract!(
      'tests/fixtures/controllers/rootController.ts',
      TSOA_OFFICIAL_ROOT_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /']);
  });

  it('inherits @Route prefix for a child controller in the same file', () => {
    const result = tsoaResolver.extract!(
      'tests/fixtures/controllers/inheritedRouteController.ts',
      TSOA_INHERITED_ROUTE_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/shared/health',
      'POST /api/v1/shared/widgets',
    ]);
  });

  it('extracts lightdash multi-class file with trailing-slash paths', () => {
    const result = tsoaResolver.extract!(
      'packages/backend/src/controllers/userAvatarController.ts',
      LIGHTDASH_MULTI_ROUTE_FILE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/v1/user/me/avatar/',
      'GET /api/v1/users/{userUuid}/avatar/{contentHash}',
      'PUT /api/v1/user/me/avatar/',
    ]);
  });

  it('postExtract prepends inherited @Route from another file', () => {
    const ctx = {
      getAllFiles: () => ['base.ts', 'child.ts'],
      readFile: (fp: string) => {
        if (fp === 'base.ts') {
          return `
import { Controller, Get, Route } from '@tsoa/runtime';
@Route('/api/v1/shared')
export class SharedRoutesController extends Controller {
  @Get('health')
  public async health(): Promise<void> {}
}
`;
        }
        if (fp === 'child.ts') {
          return `
import { Post } from '@tsoa/runtime';
import { SharedRoutesController } from './base';
export class ChildRoutesController extends SharedRoutesController {
  @Post('widgets')
  public async createWidget(): Promise<void> {}
}
`;
        }
        return null;
      },
      getNodesInFile: (fp: string) => {
        if (fp !== 'child.ts') return [];
        return [
          {
            id: 'route:child.ts:5:POST:/widgets',
            kind: 'route',
            name: 'POST /widgets',
            qualifiedName: 'child.ts::POST:/widgets',
            filePath: 'child.ts',
            startLine: 5,
            endLine: 5,
            startColumn: 0,
            endColumn: 1,
            language: 'typescript',
            updatedAt: 0,
          },
        ];
      },
    } as any;

    const updates = tsoaResolver.postExtract!(ctx);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('POST /api/v1/shared/widgets');
  });
});

describe('next-app-router plugin (framework: Next.js App Router)', () => {
  it('extracts formbricks re-export GET handlers', () => {
    const result = nextAppRouterResolver.extract!(
      'apps/web/app/api/v2/health/route.ts',
      FORMBRICKS_HEALTH_ROUTE_REEXPORT
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /api/v2/health']);
  });

  it('extracts cal.com export const POST handlers', () => {
    const result = nextAppRouterResolver.extract!(
      'apps/web/app/api/auth/signup/route.ts',
      CALCOM_SIGNUP_ROUTE_CONST
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['POST /api/auth/signup']);
  });

  it('extracts taxonomy export async function GET/POST', () => {
    const result = nextAppRouterResolver.extract!(
      'app/api/posts/route.ts',
      TAXONOMY_POSTS_ROUTE_FUNCTION
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/posts',
      'POST /api/posts',
    ]);
  });

  it('does not steal page.tsx UI routes from stock react', () => {
    const page = `
export default function Page() { return null; }
`;
    const fromPlugin = nextAppRouterResolver.extract!('app/about/page.tsx', page);
    expect(fromPlugin.nodes).toHaveLength(0);

    const fromReact = reactResolver.extract!('app/about/page.tsx', page);
    expect(fromReact.nodes.map((n) => n.name)).toEqual(['/about']);
  });

  it('tags HTTP handlers by METHOD-prefixed route name', () => {
    const result = nextAppRouterResolver.extract!(
      'apps/web/app/api/v2/health/route.ts',
      FORMBRICKS_HEALTH_ROUTE_REEXPORT
    );
    expect(result.nodes[0]?.name).toBe('GET /api/v2/health');
    expect(isNextHttpRouteHandler(result.nodes[0]!)).toBe(true);
  });

  it('strips Next.js route groups from handler paths', () => {
    expect(
      filePathToAppRoute('apps/web/app/(app)/environments/[id]/route.ts', 'route')
    ).toBe('/environments/:id');
    expect(
      filePathToAppRoute('apps/web/app/(auth)/auth/login/page.tsx', 'page')
    ).toBe('/auth/login');
  });

  it('does not index module implementation route.ts outside app/', () => {
    const impl = `
export async function GET() { return Response.json({ ok: true }); }
`;
    const result = nextAppRouterResolver.extract!('modules/api/v2/health/route.ts', impl);
    expect(result.nodes).toHaveLength(0);
  });

  it('separates page UI routes from HTTP handlers for endpoint totals', () => {
    const page = `export default function Page() { return null; }`;
    const pageNodes = reactResolver.extract!('app/(app)/dashboard/page.tsx', page).nodes;
    const handlerNodes = nextAppRouterResolver.extract!(
      'app/api/v2/health/route.ts',
      FORMBRICKS_HEALTH_ROUTE_REEXPORT
    ).nodes;

    expect(pageNodes).toHaveLength(1);
    expect(handlerNodes).toHaveLength(1);

    const allRoutes = [...pageNodes, ...handlerNodes];
    expect(allRoutes).toHaveLength(2);
    expect(allRoutes.filter(isNextHttpRouteHandler)).toHaveLength(1);
    expect(allRoutes.filter(isNextPageRoute)).toHaveLength(1);
    expect(allRoutes.filter(isNextHttpRouteHandler).map((n) => n.name)).toEqual([
      'GET /api/v2/health',
    ]);
  });
});

describe('nestjs plugin (framework: NestJS)', () => {
  it('extracts novu WidgetsController REST routes', () => {
    const result = nestjsKernoResolver.extract!(
      'apps/api/src/app/widgets/widgets.controller.ts',
      NOVU_WIDGETS_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /widgets/notifications/feed',
      'GET /widgets/notifications/unseen',
      'POST /widgets/session/initialize',
    ]);
  });

  it('extracts twenty HealthController', () => {
    const result = nestjsKernoResolver.extract!(
      'packages/twenty-server/src/engine/core-modules/health/controllers/health.controller.ts',
      TWENTY_HEALTH_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /healthz']);
  });

  it('extracts @MetadataResolver + @ResolveField + @Query from twenty-style resolver', () => {
    const result = nestjsKernoResolver.extract!(
      'packages/twenty-server/src/engine/metadata-modules/object-metadata/object-metadata.resolver.ts',
      TWENTY_OBJECT_METADATA_RESOLVER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'QUERY objectRecordCounts',
      'RESOLVE_FIELD isUIReadOnly',
    ]);
  });

  it('emits versioned HTTP paths for @Controller version and @Version', () => {
    const result = nestjsKernoResolver.extract!(
      'cats.controller.ts',
      NEST_VERSIONED_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /v1/cats',
      'GET /v2/cats/beta',
    ]);
  });

  it('applies setGlobalPrefix in postExtract', () => {
    const route = {
      id: 'route:users.controller.ts:3:GET:/users',
      kind: 'route' as const,
      name: 'GET /users',
      qualifiedName: 'users.controller.ts::GET:/users',
      filePath: 'users.controller.ts',
      language: 'typescript' as const,
      startLine: 3,
      endLine: 3,
      startColumn: 0,
      endColumn: 0,
      updatedAt: 0,
    };
    const ctx = {
      getNodesInFile: () => [route],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: (kind: string) => (kind === 'route' ? [route] : []),
      iterateNodesByKind: (kind: string) =>
        kind === 'route' ? [route][Symbol.iterator]() : [][Symbol.iterator](),
      fileExists: () => true,
      readFile: (fp: string) =>
        fp === 'src/main.ts' ? "app.setGlobalPrefix('api');" : null,
      getProjectRoot: () => '/test',
      getAllFiles: () => ['src/main.ts'],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = nestjsKernoResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('GET /api/users');
  });
});

describe('php-http-routes plugin (framework: Laravel + Utopia HTTP)', () => {
  it('extracts appwrite Http::get/post routes', () => {
    const result = phpHttpRoutesResolver.extract!(
      'app/controllers/api/locale.php',
      APPWRITE_LOCALE_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /v1/locale',
      'GET /v1/locale/codes',
      'POST /v1/locale/currencies',
    ]);
  });

  it('extracts appwrite Platform setHttpMethod/setHttpPath routes', () => {
    const result = phpHttpRoutesResolver.extract!(
      'src/Appwrite/Platform/Modules/Functions/Http/Deployments/Vcs/Create.php',
      APPWRITE_PLATFORM_VCS_CREATE
    );
    expect(result.nodes.map((n) => n.name)).toEqual([
      'POST /v1/functions/:functionId/deployments/vcs',
    ]);
  });

  it('extracts firefly-iii Route:: with uses-array handler syntax', () => {
    const result = phpHttpRoutesResolver.extract!('routes/web.php', FIREFLY_PASSPORT_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /personal-access-tokens/{token_id}',
      'GET /personal-access-tokens',
      'POST /personal-access-tokens',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'OAuthController@destroyPersonalAccessToken',
      'OAuthController@listPersonalAccessTokens',
      'OAuthController@storePersonalAccessToken',
    ]);
  });

  it('extracts Laravel Route:: tuple and Controller@action syntax', () => {
    const src = `
Route::get('/users', [UserController::class, 'index']);
Route::post('/users', 'UserController@store');
Route::resource('users', UserController::class);
`;
    const result = phpHttpRoutesResolver.extract!('routes/web.php', src);
    expect(result.nodes.map((n) => n.name)).toContain('GET /users');
    expect(result.references.map((r) => r.referenceName)).toContain('UserController@index');
    expect(result.references.map((r) => r.referenceName)).toContain('UserController@store');
  });
});

describe('hapi plugin (framework: Hapi)', () => {
  it('detects @hapi/hapi dependency and ignores express-only projects', () => {
    const positive = {
      readFile: (fp: string) =>
        fp === 'package.json'
          ? JSON.stringify({ dependencies: { '@hapi/hapi': '^21.0.0' } })
          : null,
      getAllFiles: () => ['package.json'],
      fileExists: () => true,
      getProjectRoot: () => '/test',
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(hapiResolver.detect(positive as any)).toBe(true);

    const negative = {
      ...positive,
      readFile: (fp: string) =>
        fp === 'package.json' ? JSON.stringify({ dependencies: { express: '^4.0.0' } }) : null,
    };
    expect(hapiResolver.detect(negative as any)).toBe(false);
  });

  it('does not let Express claim @hapi/hapi projects', () => {
    const ctx = {
      readFile: (fp: string) =>
        fp === 'package.json'
          ? JSON.stringify({ dependencies: { '@hapi/hapi': '^21.0.0' } })
          : null,
      getAllFiles: () => ['package.json'],
      fileExists: () => true,
      getProjectRoot: () => '/test',
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(expressResolver.detect(ctx as any)).toBe(false);
    expect(hapiResolver.detect(ctx as any)).toBe(true);
  });

  it('extracts jbuget clean-architecture users route array + controller refs', () => {
    const result = hapiResolver.extract!(
      'lib/interfaces/routes/users.js',
      HAPI_CLEAN_ARCH_USERS
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /users/{id}',
      'GET /users',
      'GET /users/{id}',
      'POST /users',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'UsersController.createUser',
      'UsersController.deleteUser',
      'UsersController.findUsers',
      'UsersController.getUser',
    ]);
  });

  it('extracts jedireza/frame login plugin routes', () => {
    const result = hapiResolver.extract!('server/api/login.js', HAPI_FRAME_LOGIN);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'POST /api/login',
      'POST /api/login/forgot',
    ]);
  });

  it('extracts sparkjoke top-level server.route paths', () => {
    const result = hapiResolver.extract!('api/routes.js', HAPI_SPARKJOKE_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /jokes/{jokeIdx}',
      'GET /jokesUpperBound',
      'GET /welcome',
    ]);
  });

  it('extracts method arrays, catch-all *, and same-file register prefix', () => {
    const result = hapiResolver.extract!('server.js', HAPI_METHOD_ARRAY_AND_PREFIX);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'ALL /{p*}',
      'GET /api/health',
      'POST /items',
      'PUT /items',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'healthCheck',
      'notFound',
      'saveItem',
      'saveItem',
    ]);
  });

  it('applies cross-file register routes.prefix in postExtract', () => {
    const route = {
      id: 'route:lib/interfaces/routes/users.js:10:GET:/users',
      kind: 'route' as const,
      name: 'GET /users',
      qualifiedName: 'lib/interfaces/routes/users.js::route:GET:/users',
      filePath: 'lib/interfaces/routes/users.js',
      language: 'javascript' as const,
      startLine: 10,
      endLine: 10,
      startColumn: 0,
      endColumn: 0,
      updatedAt: 0,
    };
    const ctx = {
      getNodesInFile: () => [route],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: (kind: string) => (kind === 'route' ? [route] : []),
      iterateNodesByKind: (kind: string) =>
        kind === 'route' ? [route][Symbol.iterator]() : [][Symbol.iterator](),
      fileExists: () => true,
      readFile: (fp: string) => {
        if (fp === 'lib/infrastructure/webserver/server.js') {
          return `
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 3000 });
await server.register(require('../../interfaces/routes/users'), {
  routes: { prefix: '/api/v1' },
});
`;
        }
        return null;
      },
      getProjectRoot: () => '/test',
      getAllFiles: () => [
        'lib/infrastructure/webserver/server.js',
        'lib/interfaces/routes/users.js',
      ],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = hapiResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('GET /api/v1/users');
  });
});
