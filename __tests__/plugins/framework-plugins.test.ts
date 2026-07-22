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
import { remixResolver } from '../../src/plugins/remix/resolver';
import {
  isNextHttpRouteHandler,
  isNextPageRoute,
  filePathToAppRoute,
} from '../../src/plugins/next-app-router/route-path';
import {
  filePathToRemixRoute,
  flatRouteIdToPath,
} from '../../src/plugins/remix/route-path';
import { parseRoutesConfig, resolveRouteModulePath } from '../../src/plugins/remix/routes-config';
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
  HEADPLANE_HEALTHZ_LOADER,
  HEADPLANE_COLOR_SCHEME_ACTION,
  HEADPLANE_ROUTES_TS,
  EPIC_STACK_HEALTHCHECK_LOADER,
  EPIC_STACK_THEME_SWITCH_ACTION,
} from './fixtures';

describe('in-repo plugin registry', () => {
  it('exposes all Kerno built-in framework plugins', () => {
    const ids = getBuiltInPlugins().map((p) => p.id).sort();
    expect(ids).toEqual([
      'kerno-go-http',
      'kerno-nestjs',
      'kerno-next-app-router',
      'kerno-php-http-routes',
      'kerno-remix',
      'kerno-tsoa',
    ]);
    expect(getBuiltInPluginResolvers().map((r) => r.name).sort()).toEqual([
      'go',
      'laravel',
      'nestjs',
      'next-app-router',
      'remix',
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

describe('remix plugin (framework: Remix / React Router framework mode)', () => {
  it('extracts headplane healthz loader as GET from file convention', () => {
    const result = remixResolver.extract!(
      'app/routes/util/healthz.ts',
      HEADPLANE_HEALTHZ_LOADER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /util/healthz']);
    expect(result.references.map((r) => r.referenceName)).toEqual(['loader']);
  });

  it('extracts headplane color-scheme action as POST', () => {
    const result = remixResolver.extract!(
      'app/routes/util/color-scheme.ts',
      HEADPLANE_COLOR_SCHEME_ACTION
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['POST /util/color-scheme']);
  });

  it('extracts epic-stack folder-nested healthcheck loader', () => {
    const result = remixResolver.extract!(
      'app/routes/resources/healthcheck.tsx',
      EPIC_STACK_HEALTHCHECK_LOADER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /resources/healthcheck']);
  });

  it('extracts epic-stack theme-switch action', () => {
    const result = remixResolver.extract!(
      'app/routes/resources/theme-switch.tsx',
      EPIC_STACK_THEME_SWITCH_ACTION
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['POST /resources/theme-switch']);
  });

  it('maps flat-route ids and pathless layouts', () => {
    expect(flatRouteIdToPath('_index')).toBe('/');
    expect(flatRouteIdToPath('about')).toBe('/about');
    expect(flatRouteIdToPath('concerts.$city')).toBe('/concerts/{city}');
    expect(flatRouteIdToPath('_auth.login')).toBe('/login');
    expect(flatRouteIdToPath('concerts_.mine')).toBe('/concerts/mine');
    expect(flatRouteIdToPath('sitemap[.]xml')).toBe('/sitemap.xml');
    expect(filePathToRemixRoute('app/routes/($lang).categories.tsx')).toBe(
      '/{lang}/categories'
    );
  });

  it('parses headplane routes.ts helpers including prefix', () => {
    const entries = parseRoutesConfig(HEADPLANE_ROUTES_TS);
    expect(entries).toEqual(
      expect.arrayContaining([
        { urlPath: '/healthz', modulePath: 'routes/util/healthz.ts' },
        { urlPath: '/api/info', modulePath: 'routes/util/info.ts' },
        { urlPath: '/api/color-scheme', modulePath: 'routes/util/color-scheme.ts' },
        { urlPath: '/', modulePath: 'routes/home.tsx' },
        { urlPath: '/machines', modulePath: 'routes/machines/overview.tsx' },
        { urlPath: '/machines/{id}', modulePath: 'routes/machines/machine.tsx' },
      ])
    );
  });

  it('postExtract rewrites file-convention paths from routes.ts', () => {
    const extracted = remixResolver.extract!(
      'app/routes/util/healthz.ts',
      HEADPLANE_HEALTHZ_LOADER
    );
    const route = extracted.nodes[0]!;
    expect(route.name).toBe('GET /util/healthz');

    const ctx = {
      getAllFiles: () => ['app/routes.ts', 'app/routes/util/healthz.ts'],
      readFile: (fp: string) => (fp === 'app/routes.ts' ? HEADPLANE_ROUTES_TS : null),
      getNodesInFile: (fp: string) => (fp === 'app/routes/util/healthz.ts' ? [route] : []),
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      iterateNodesByKind: () => [][Symbol.iterator](),
      fileExists: () => true,
      getProjectRoot: () => '/test',
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = remixResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('GET /healthz');
    expect(updates[0]!.id).toBe(route.id);
  });

  it('detects framework-mode deps and rejects plain react', () => {
    const positive = {
      getAllFiles: () => ['package.json', 'app/routes.ts'],
      readFile: (fp: string) => {
        if (fp === 'package.json') {
          return JSON.stringify({
            dependencies: { 'react-router': '^7', '@react-router/dev': '^7' },
          });
        }
        return null;
      },
      getNodesInFile: () => [],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      iterateNodesByKind: () => [][Symbol.iterator](),
      fileExists: () => true,
      getProjectRoot: () => '/test',
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(remixResolver.detect(positive as any)).toBe(true);

    const negative = {
      ...positive,
      getAllFiles: () => ['package.json', 'src/App.tsx'],
      readFile: (fp: string) =>
        fp === 'package.json'
          ? JSON.stringify({ dependencies: { react: '^18', 'react-router-dom': '^6' } })
          : null,
    };
    expect(remixResolver.detect(negative as any)).toBe(false);
  });

  it('resolves module paths relative to routes.ts', () => {
    expect(resolveRouteModulePath('app/routes.ts', 'routes/util/healthz.ts')).toBe(
      'app/routes/util/healthz.ts'
    );
  });

  it('ignores UI-only route modules without loader/action', () => {
    const uiOnly = `
export default function About() {
  return <h1>About</h1>;
}
`;
    const result = remixResolver.extract!('app/routes/about.tsx', uiOnly);
    expect(result.nodes).toHaveLength(0);
  });
});
