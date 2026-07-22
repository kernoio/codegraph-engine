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
import { slimResolver } from '../../src/plugins/slim/resolver';
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
  SLIM_SKELETON_ROUTES,
  SLIM_REST_API_ROUTES,
  SLIM_REALWORLD_ROUTES,
} from './fixtures';

describe('in-repo plugin registry', () => {
  it('exposes all Kerno built-in framework plugins', () => {
    const ids = getBuiltInPlugins().map((p) => p.id).sort();
    expect(ids).toEqual([
      'kerno-go-http',
      'kerno-nestjs',
      'kerno-next-app-router',
      'kerno-php-http-routes',
      'kerno-slim',
      'kerno-tsoa',
    ]);
    expect(getBuiltInPluginResolvers().map((r) => r.name).sort()).toEqual([
      'go',
      'laravel',
      'nestjs',
      'next-app-router',
      'slim',
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

describe('slim plugin (framework: Slim)', () => {
  it('extracts slimphp/Slim-Skeleton verb + group routes', () => {
    const result = slimResolver.extract!('app/routes.php', SLIM_SKELETON_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /users',
      'GET /users/{id}',
      'OPTIONS /{routes}',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'ListUsersAction',
      'ViewUserAction',
    ]);
  });

  it('extracts maurobonfietti/rest-api-slim-php nested groups', () => {
    const result = slimResolver.extract!('src/App/Routes.php', SLIM_REST_API_ROUTES);
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual([
      'DELETE /api/v1/tasks/{id}',
      'DELETE /api/v1/users/{id}',
      'GET /',
      'GET /api/v1/tasks',
      'GET /api/v1/tasks/{id}',
      'GET /api/v1/users',
      'GET /api/v1/users/{id}',
      'GET /status',
      'POST /api/v1/tasks',
      'POST /api/v1/users',
      'POST /login',
      'PUT /api/v1/tasks/{id}',
      'PUT /api/v1/users/{id}',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('DefaultController@getHelp');
    expect(result.references.map((r) => r.referenceName)).toContain('Login');
    expect(result.references.map((r) => r.referenceName)).toContain('GetAll');
  });

  it('extracts realworld Class::class . :method, map(), and optional placeholders', () => {
    const result = slimResolver.extract!('src/routes.php', SLIM_REALWORLD_ROUTES);
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toContain('POST /api/users');
    expect(names).toContain('POST /api/users/login');
    expect(names).toContain('GET /api/user');
    expect(names).toContain('PUT /api/user');
    expect(names).toContain('GET /api/books/{id}');
    expect(names).toContain('DELETE /api/books/{id}');
    expect(names).toContain('PATCH /api/books/{id}');
    expect(names).toContain('PUT /api/books/{id}');
    expect(names).toContain('GET /{name}');
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'LoginController@login',
      'RegisterController@register',
      'UserController@show',
      'UserController@update',
    ]);
  });

  it('detects slim/slim composer dependency and rejects unrelated PHP', () => {
    const files = new Map<string, string>([
      [
        'composer.json',
        JSON.stringify({ require: { 'slim/slim': '^4.0', php: '^8.1' } }),
      ],
      ['app/routes.php', SLIM_SKELETON_ROUTES],
    ]);
    const ctx = {
      projectRoot: '/tmp/slim-app',
      fileExists: (p: string) => files.has(p),
      readFile: (p: string) => files.get(p) ?? null,
      getAllFiles: () => [...files.keys()],
      getNodesByName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
    };
    expect(slimResolver.detect!(ctx as never)).toBe(true);

    const laravel = {
      ...ctx,
      readFile: (p: string) =>
        p === 'composer.json'
          ? JSON.stringify({ require: { 'laravel/framework': '^11.0' } })
          : null,
      getAllFiles: () => ['composer.json'],
      fileExists: (p: string) => p === 'composer.json',
    };
    expect(slimResolver.detect!(laravel as never)).toBe(false);
  });
});
