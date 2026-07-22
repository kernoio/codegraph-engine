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
import { honoResolver } from '../../src/plugins/hono/resolver';
import { ktorResolver } from '../../src/plugins/ktor/resolver';
import { sinatraGrapeResolver } from '../../src/plugins/sinatra-grape/resolver';
import { symfonyResolver } from '../../src/plugins/symfony/resolver';
import { fastifyResolver } from '../../src/plugins/fastify/resolver';
import { jaxrsResolver } from '../../src/plugins/jaxrs/resolver';
import { micronautResolver } from '../../src/plugins/micronaut/resolver';
import { koaResolver } from '../../src/plugins/koa/resolver';
import { slimResolver } from '../../src/plugins/slim/resolver';
import { aiohttpResolver } from '../../src/plugins/aiohttp/resolver';
import { sanicResolver } from '../../src/plugins/sanic/resolver';
import { hapiResolver } from '../../src/plugins/hapi/resolver';
import { expressResolver } from '../../src/resolution/frameworks/express';
import { litestarResolver } from '../../src/plugins/litestar/resolver';
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
  HONO_EXAMPLES_BLOG_API,
  HONO_EXAMPLES_BLOG_INDEX,
  HONO_EXAMPLES_BASIC,
  HONO_BASEPATH_CHAIN_ON,
  NOTYKT_NOTE_ROUTER,
  KTOR_STARTER_WIDGET_RESOURCE,
  KTOR_SAMPLES_WISH_ROUTING,
  LAMERNEWS_SINATRA_ROUTES,
  PIZZA_SINATRA_NAMESPACE_ROUTES,
  GRAPE_README_TWITTER_API,
  GRAPE_ON_RACK_PING,
  GRAPE_ON_RACK_API_MOUNT,
  GRAPE_ON_RACK_POST_PUT,
  SYMFONY_DEMO_BLOG_CONTROLLER,
  SYMFONY_DEMO_BLOG_ANNOTATIONS,
  SYMFONY_SYLIUS_CART_YAML,
  SYMFONY_DOCS_ROUTES_XML,
  FASTIFY_DEMO_TASKS_ROUTES,
  HMAKE_FASTIFY_USER_ROUTER,
  FASTIFY_ROUTE_PREFIX_EXAMPLE,
  FASTIFY_ROUTE_OBJECT,
  DROPWIZARD_HELLO_WORLD_RESOURCE,
  DROPWIZARD_PERSON_RESOURCE,
  QUARKUS_GREETING_RESOURCE,
  QUARKUS_FRUIT_RESOURCE,
  KESTRA_MISC_CONTROLLER,
  KESTRA_CLUSTER_CONTROLLER,
  KESTRA_KV_CONTROLLER,
  ASC_LAB_HELLO_CONTROLLER,
  ASC_LAB_OFFER_GATEWAY_CONTROLLER,
  MILL_MICRONAUT_HELLO_KT,
  KOA_EXAMPLES_BLOG_APP,
  KAILS_USERS_ROUTES,
  KAILS_ARTICLES_ROUTES,
  KOA_NESTED_MOUNT_EXAMPLE,
  SLIM_SKELETON_ROUTES,
  SLIM_REST_API_ROUTES,
  SLIM_REALWORLD_ROUTES,
  AIOHTTP_DEMOS_POLLS_ROUTES,
  AIOHTTP_DEMOS_BLOG_ROUTES,
  AIOHTTP_STATUS_ROUTETABLE,
  AIOHTTP_WORD_ADD_ROUTES,
  AIOHTTP_VIEW_AND_SUBAPP,
  OWLLOOK_API_BLUEPRINT,
  SANIC_OFFICIAL_BLUEPRINTS,
  SANIC_HELLO_WORLD,
  SANIC_JWT_ON_BLUEPRINT,
  SANIC_JWT_CBV,
  HAPI_CLEAN_ARCH_USERS,
  HAPI_FRAME_LOGIN,
  HAPI_SPARKJOKE_ROUTES,
  HAPI_METHOD_ARRAY_AND_PREFIX,
  NLLB_TRANSLATOR_CONTROLLER,
  LITESTAR_FULLSTACK_USER_CONTROLLER,
  LITESTAR_FULLSTACK_TEAM_CONTROLLER,
  LITESTAR_ROUTE_AND_ROUTER,
} from './fixtures';

describe('in-repo plugin registry', () => {
  it('exposes all Kerno built-in framework plugins', () => {
    const ids = getBuiltInPlugins().map((p) => p.id).sort();
    expect(ids).toEqual([
      'kerno-fastify',
      'kerno-aiohttp',
      'kerno-go-http',
      'kerno-hono',
      'kerno-ktor',
      'kerno-jaxrs',
      'kerno-micronaut',
      'kerno-koa',
      'kerno-hapi',
      'kerno-litestar',
      'kerno-nestjs',
      'kerno-next-app-router',
      'kerno-php-http-routes',
      'kerno-sinatra-grape',
      'kerno-symfony',
      'kerno-slim',
      'kerno-sanic',
      'kerno-tsoa',
    ]);
    expect(getBuiltInPluginResolvers().map((r) => r.name).sort()).toEqual([
      'fastify',
      'aiohttp',
      'go',
      'hono',
      'ktor',
      'jaxrs',
      'koa',
      'hapi',
      'laravel',
      'micronaut',
      'litestar',
      'nestjs',
      'next-app-router',
      'sinatra-grape',
      'symfony',
      'slim',
      'sanic',
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

describe('aiohttp plugin (framework: aiohttp)', () => {
  it('extracts aio-libs/aiohttp-demos polls router.add_* routes', () => {
    const result = aiohttpResolver.extract!(
      'demos/polls/aiohttpdemo_polls/routes.py',
      AIOHTTP_DEMOS_POLLS_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /poll/{question_id}',
      'GET /poll/{question_id}/results',
      'POST /poll/{question_id}/vote',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'index',
      'poll',
      'results',
      'vote',
    ]);
  });

  it('extracts aio-libs/aiohttp-demos blog router.add_* routes', () => {
    const result = aiohttpResolver.extract!(
      'demos/blog/aiohttpdemo_blog/routes.py',
      AIOHTTP_DEMOS_BLOG_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /create',
      'GET /login',
      'POST /create',
      'POST /login',
      'POST /logout',
    ]);
  });

  it('extracts dani3l0/Status RouteTableDef decorators', () => {
    const result = aiohttpResolver.extract!('status.py', AIOHTTP_STATUS_ROUTETABLE);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /api/status',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'api',
      'index',
    ]);
  });

  it('extracts turtlesoupy web.get add_routes table (skips web.static)', () => {
    const result = aiohttpResolver.extract!('website/main.py', AIOHTTP_WORD_ADD_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /api/random_word.json',
      'GET /define_word',
      'GET /favicon.ico',
      'GET /shorten_word_url/{word}/{encrypt}',
      'GET /w/{word}/{encrypt}',
    ]);
  });

  it('extracts same-file View verbs and add_subapp prefix', () => {
    const result = aiohttpResolver.extract!('app.py', AIOHTTP_VIEW_AND_SUBAPP);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /admin/resource',
      'GET /admin/stats',
      'POST /admin/stats',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'StatsView',
      'StatsView',
      'handle_resource',
    ]);
  });

  it('detects aiohttp via requirements + route signal; rejects client-only', () => {
    const positive = {
      readFile: (f: string) => {
        if (f === 'requirements.txt') return 'aiohttp==3.9.0\n';
        if (f === 'routes.py') {
          return 'from aiohttp import web\napp = web.Application()\napp.router.add_get("/", index)\n';
        }
        return null;
      },
      getAllFiles: () => ['requirements.txt', 'routes.py'],
describe('sanic plugin (framework: Sanic)', () => {
  it('extracts owllook Blueprint url_prefix + path params + methods', () => {
    const result = sanicResolver.extract!(
      'owllook/views/api_blueprint.py',
      OWLLOOK_API_BLUEPRINT
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/owl_bd_novels/{name}',
      'GET /api/owl_so_novels/{name}',
      'POST /api/owl_novels_chapters',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'owl_bd_novels',
      'owl_novels_chapters',
      'owl_so_novels',
    ]);
  });

  it('extracts sanic-org/sanic official blueprint example', () => {
    const result = sanicResolver.extract!('examples/blueprints.py', SANIC_OFFICIAL_BLUEPRINTS);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /my_blueprint/foo',
      'GET /my_blueprint2/foo',
    ]);
  });

  it('extracts sanic hello_world @app.route', () => {
    const result = sanicResolver.extract!('examples/hello_world.py', SANIC_HELLO_WORLD);
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /']);
    expect(result.references.map((r) => r.referenceName)).toEqual(['test']);
  });

  it('extracts sanic-jwt shorthand @blueprint.get and CBV add_route', () => {
    const bp = sanicResolver.extract!('example/on_blueprint.py', SANIC_JWT_ON_BLUEPRINT);
    expect(bp.nodes.map((n) => n.name).sort()).toEqual([
      'GET /somewhere',
      'GET /user/{id}',
    ]);

    const cbv = sanicResolver.extract!('example/cbv.py', SANIC_JWT_CBV);
    expect(cbv.nodes.map((n) => n.name).sort()).toEqual(['GET /', 'GET /protected']);
    expect(cbv.references.map((r) => r.referenceName).sort()).toEqual([
      'ProtectedView',
      'PublicView',
    ]);
  });

  it('postExtract applies app.blueprint(..., url_prefix=)', () => {
    const extracted = sanicResolver.extract!('example/on_blueprint.py', SANIC_JWT_ON_BLUEPRINT);
    const ctx = {
      getAllFiles: () => ['example/on_blueprint.py'],
      readFile: () => SANIC_JWT_ON_BLUEPRINT,
      getNodesInFile: () => extracted.nodes,
      getNodesByName: () => [],
      getImportMappings: () => [],
    };
    const updates = sanicResolver.postExtract!(ctx as any);
    expect(updates.map((n) => n.name).sort()).toEqual([
      'GET /test/somewhere',
      'GET /test/user/{id}',
    ]);
  });

  it('detects Sanic via requirements and rejects Flask-only projects', () => {
    const positive = {
      readFile: (f: string) => (f === 'requirements.txt' ? 'sanic==23.12.1\n' : null),
      getAllFiles: () => ['requirements.txt', 'app.py'],
      fileExists: () => false,
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getImportMappings: () => [],
    };
    expect(aiohttpResolver.detect(positive as any)).toBe(true);

    const clientOnly = {
      readFile: (f: string) => {
        if (f === 'requirements.txt') return 'aiohttp==3.9.0\n';
        if (f === 'client.py') {
          return 'import aiohttp\nasync def fetch():\n    async with aiohttp.ClientSession() as s:\n        await s.get("https://example.com")\n';
        }
        return null;
      },
      getAllFiles: () => ['requirements.txt', 'client.py'],
      fileExists: () => false,
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getImportMappings: () => [],
    };
    expect(aiohttpResolver.detect(clientOnly as any)).toBe(false);

    const flaskOnly = {
    expect(sanicResolver.detect(positive as any)).toBe(true);

    const negative = {
      readFile: (f: string) => {
        if (f === 'requirements.txt') return 'flask==3.0.0\n';
        if (f === 'app.py') return 'from flask import Flask\napp = Flask(__name__)\n';
        return null;
      },
      getAllFiles: () => ['requirements.txt', 'app.py'],
      fileExists: () => false,
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getImportMappings: () => [],
    };
    expect(aiohttpResolver.detect(flaskOnly as any)).toBe(false);
    expect(sanicResolver.detect(negative as any)).toBe(false);
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

describe('hono plugin (framework: Hono)', () => {
  it('detects hono dependency and ignores non-hono projects', () => {
    const positive = {
      readFile: (f: string) =>
        f === 'package.json' ? JSON.stringify({ dependencies: { hono: '^4.0.0' } }) : null,
      getAllFiles: () => [] as string[],
    };
    const negative = {
      readFile: (f: string) =>
        f === 'package.json' ? JSON.stringify({ dependencies: { express: '^4.0.0' } }) : null,
      getAllFiles: () => [] as string[],
    };
    expect(honoResolver.detect(positive as never)).toBe(true);
    expect(honoResolver.detect(negative as never)).toBe(false);
  });

  it('extracts honojs/examples blog api CRUD routes', () => {
    const result = honoResolver.extract!('blog/src/api.ts', HONO_EXAMPLES_BLOG_API);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /posts/:id',
      'GET /',
      'GET /posts',
      'GET /posts/:id',
      'POST /posts',
      'PUT /posts/:id',
    ]);
  });

  it('extracts honojs/examples basic same-file sub-router mounts', () => {
    const result = honoResolver.extract!('basic/src/index.ts', HONO_EXAMPLES_BASIC);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /api/posts',
      'GET /book',
      'GET /book/:id',
      'GET /entry/:id',
      'GET /hello',
      'POST /api/posts',
      'POST /book',
    ]);
  });

  it('extracts basePath, chained verbs, app.on, and named handlers', () => {
    const result = honoResolver.extract!('src/app.ts', HONO_BASEPATH_CHAIN_ON);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /endpoint',
      'DELETE /post',
      'GET /api/v1/users',
      'GET /endpoint',
      'POST /api/v1/users',
      'POST /endpoint',
      'PURGE /cache',
      'PUT /post',
    ]);
    // app.on(['PUT','DELETE'], …) emits one reference per verb.
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'createUser',
      'listUsers',
      'mutatePost',
      'mutatePost',
      'purgeCache',
    ]);
  });

  it('applies cross-file app.route mounts in postExtract', () => {
    const extracted = honoResolver.extract!('src/api.ts', HONO_EXAMPLES_BLOG_API);
    const ctx = {
      getAllFiles: () => ['src/index.ts', 'src/api.ts'],
      readFile: (f: string) =>
        f === 'src/index.ts' ? HONO_EXAMPLES_BLOG_INDEX : f === 'src/api.ts' ? HONO_EXAMPLES_BLOG_API : null,
      iterateNodesByKind: function* (kind: string) {
        if (kind === 'route') yield* extracted.nodes;
      },
      getNodesByKind: (kind: string) => (kind === 'route' ? extracted.nodes : []),
    };
    const updates = honoResolver.postExtract!(ctx as never);
    expect(updates.map((n) => n.name).sort()).toEqual([
      'DELETE /api/posts/:id',
      'GET /api',
      'GET /api/posts',
      'GET /api/posts/:id',
      'POST /api/posts',
      'PUT /api/posts/:id',
    ]);
  });

  it('does not treat Map.get as a route', () => {
    const src = `
import { Hono } from 'hono'
const app = new Hono()
const map = new Map()
map.get('/nope')
app.get('/ok', (c) => c.text('ok'))
`;
    const result = honoResolver.extract!('src/app.ts', src);
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /ok']);
describe('ktor plugin (framework: Ktor)', () => {
  it('extracts nested NotyKT notes routes with authenticate + route prefixes', () => {
    const result = ktorResolver.extract!(
      'noty-api/application/src/main/kotlin/dev/shreyaspatil/noty/api/route/NoteRouter.kt',
      NOTYKT_NOTE_ROUTER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /notes/{id}',
      'DELETE /notes/{id}/pin',
      'GET /notes',
      'POST /notes',
      'PUT /notes/{id}',
      'PUT /notes/{id}/pin',
    ]);
  });

  it('extracts kotlin-ktor-exposed-starter WidgetResource verbs', () => {
    const result = ktorResolver.extract!(
      'src/main/kotlin/web/WidgetResource.kt',
      KTOR_STARTER_WIDGET_RESOURCE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /widgets/{id}',
      'GET /widgets',
      'GET /widgets/{id}',
      'POST /widgets',
      'PUT /widgets',
    ]);
  });

  it('joins path segments without leading slashes (ktor-samples mvc-web)', () => {
    const result = ktorResolver.extract!(
      'mvc-web/src/main/kotlin/com/example/plugins/Routing.kt',
      KTOR_SAMPLES_WISH_ROUTING
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /wish/list',
      'GET /wish/topwishes',
      'POST /wish/cancel',
      'POST /wish/make',
    ]);
  });

  it('emits references for ::handler method refs', () => {
    const src = `
import io.ktor.server.routing.*

fun Route.api() {
  get("/health", ::healthHandler)
}
`;
    const result = ktorResolver.extract!('Api.kt', src);
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /health']);
    expect(result.references.map((r) => r.referenceName)).toEqual(['healthHandler']);
  });

  it('ignores RestAssured client get/post helpers without Ktor routing imports', () => {
    const src = `
import io.restassured.RestAssured.*

class WidgetResourceTest {
  fun testGet() {
    get("/widgets")
    delete("/widgets/{id}", "1")
  }
}
`;
    const result = ktorResolver.extract!('src/test/kotlin/web/WidgetResourceTest.kt', src);
    expect(result.nodes).toEqual([]);
  });

  it('detects Ktor via gradle dependency and rejects unrelated projects', () => {
    const positive = {
      getAllFiles: () => ['build.gradle.kts', 'src/Main.kt'],
      readFile: (fp: string) =>
        fp === 'build.gradle.kts'
          ? 'dependencies { implementation("io.ktor:ktor-server-netty:2.3.7") }'
          : null,
      fileExists: () => false,
      getNodesInFile: () => [],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
describe('symfony plugin (framework: Symfony)', () => {
  it('extracts symfony/demo BlogController #[Route] attributes with class prefix', () => {
    const result = symfonyResolver.extract!(
      'src/Controller/BlogController.php',
      SYMFONY_DEMO_BLOG_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /blog',
      'GET /blog/page/{page}',
      'GET /blog/posts/{slug}',
      'GET /blog/rss.xml',
      'GET /blog/search',
      'POST /blog/comment/{postSlug}/new',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('BlogController::index');
    expect(result.references.map((r) => r.referenceName)).toContain('BlogController::postShow');
  });

  it('extracts legacy @Route annotations with class prefix', () => {
    const result = symfonyResolver.extract!(
      'src/Controller/BlogController.php',
      SYMFONY_DEMO_BLOG_ANNOTATIONS
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /blog',
      'GET /blog/page/{page}',
      'GET /blog/posts/{slug}',
      'GET /blog/rss.xml',
      'POST /blog/comment/{postSlug}/new',
    ]);
  });

  it('extracts Sylius YAML cart routes and skips resource imports', () => {
    const result = symfonyResolver.extract!(
      'Resources/config/routing/cart.yml',
      SYMFONY_SYLIUS_CART_YAML
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'PATCH /checkout',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain(
      'sylius.controller.order::summaryAction'
    );
  });

  it('does not treat monolog package YAML path keys as routes', () => {
    const monolog = `
monolog:
    handlers:
        nested:
            type: stream
            path: php://stderr
            level: debug
`;
    const result = symfonyResolver.extract!('config/packages/monolog.yaml', monolog);
    expect(result.nodes).toEqual([]);
  });

  it('extracts XML route tables from Symfony docs shape', () => {
    const result = symfonyResolver.extract!('config/routes.xml', SYMFONY_DOCS_ROUTES_XML);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /blog',
      'GET /blog/{slug}',
      'HEAD /blog/{slug}',
    ]);
  });

  it('detects Symfony via framework-bundle and rejects Laravel-only composer', () => {
    const symfonyCtx = {
      readFile: (f: string) =>
        f === 'composer.json'
          ? JSON.stringify({ require: { 'symfony/framework-bundle': '^7.0' } })
          : null,
      fileExists: () => false,
      getAllFiles: () => [] as string[],
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      iterateNodesByKind: () => [][Symbol.iterator](),
      getProjectRoot: () => '/tmp',
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(ktorResolver.detect(positive as any)).toBe(true);

    const negative = {
      ...positive,
      getAllFiles: () => ['build.gradle.kts', 'src/Main.kt'],
      readFile: (fp: string) =>
        fp === 'build.gradle.kts'
          ? 'dependencies { implementation("org.springframework.boot:spring-boot-starter-web") }'
          : 'package demo\nfun main() {}',
    };
    expect(ktorResolver.detect(negative as any)).toBe(false);
describe('sinatra-grape plugin (framework: Sinatra + Grape)', () => {
  it('extracts lamernews top-level Sinatra DSL routes', () => {
    const result = sinatraGrapeResolver.extract!('app.rb', LAMERNEWS_SINATRA_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /api/getnews/{sort}/{start}/{count}',
      'GET /latest/{start}',
      'POST /api/submit',
    ]);
  });

  it('extracts stevekinney/pizza nested Sinatra namespaces', () => {
    const result = sinatraGrapeResolver.extract!(
      'api/v1/pizzerias.rb',
      PIZZA_SINATRA_NAMESPACE_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/pizzerias',
      'GET /api/v1/pizzerias/{id}',
      'GET /api/v1/properties/search',
    ]);
  });

  it('extracts grape README Twitter API (header version ignored, resource + route_param)', () => {
    const result = sinatraGrapeResolver.extract!('api/twitter.rb', GRAPE_README_TWITTER_API);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/statuses/{id}',
      'GET /api/statuses/home_timeline',
      'GET /api/statuses/public_timeline',
      'GET /api/statuses/{id}',
      'POST /api/statuses',
      'PUT /api/statuses/{id}',
    ]);
  });

  it('extracts grape-on-rack symbol paths', () => {
    const result = sinatraGrapeResolver.extract!('api/post_put.rb', GRAPE_ON_RACK_POST_PUT);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /ring',
      'POST /ring',
      'PUT /ring',
    ]);
  });

  it('postExtract applies Grape mount parent prefix', () => {
    const ping = sinatraGrapeResolver.extract!('api/ping.rb', GRAPE_ON_RACK_PING);
    const files = new Map<string, string>([
      ['api/ping.rb', GRAPE_ON_RACK_PING],
      ['app/api.rb', GRAPE_ON_RACK_API_MOUNT],
      ['Gemfile', "gem 'grape'\n"],
    ]);
    const ctx = {
      getAllFiles: () => [...files.keys()],
      readFile: (p: string) => files.get(p) ?? null,
      fileExists: (p: string) => files.has(p),
      getNodesByKind: (kind: string) => (kind === 'route' ? ping.nodes : []),
      iterateNodesByKind: (kind: string) =>
        kind === 'route' ? ping.nodes[Symbol.iterator]() : [][Symbol.iterator](),
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getImportMappings: () => [],
    };
    const updates = sinatraGrapeResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('GET /api/ping');
  });

  it('detects Sinatra/Grape via Gemfile and rejects unrelated Ruby projects', () => {
    const sinatraCtx = {
      readFile: (p: string) => (p === 'Gemfile' ? "gem 'sinatra'\n" : null),
      fileExists: () => false,
      getAllFiles: () => ['Gemfile'],
      getNodesByKind: () => [],
      getNodesByName: () => [],
      getNodesInFile: () => [],
      getImportMappings: () => [],
    };
    expect(sinatraGrapeResolver.detect(sinatraCtx as any)).toBe(true);

    const grapeCtx = {
      ...sinatraCtx,
      readFile: (p: string) => (p === 'Gemfile' ? "gem 'grape'\n" : null),
    };
    expect(sinatraGrapeResolver.detect(grapeCtx as any)).toBe(true);

    const railsOnlyCtx = {
      ...sinatraCtx,
      readFile: (p: string) => (p === 'Gemfile' ? "gem 'rails'\n" : null),
      getAllFiles: () => ['Gemfile', 'config/routes.rb'],
    };
    expect(sinatraGrapeResolver.detect(railsOnlyCtx as any)).toBe(false);
    expect(symfonyResolver.detect(symfonyCtx as any)).toBe(true);

    const laravelCtx = {
      ...symfonyCtx,
      readFile: (f: string) =>
        f === 'composer.json'
          ? JSON.stringify({
              require: {
                'laravel/framework': '^11.0',
                'symfony/routing': '^7.0',
                'symfony/http-foundation': '^7.0',
              },
            })
          : null,
    };
    expect(symfonyResolver.detect(laravelCtx as any)).toBe(false);
describe('fastify plugin (framework: Fastify)', () => {
  it('detects fastify dependency and ignores express-only projects', () => {
    const positive = {
      readFile: (fp: string) =>
        fp === 'package.json' ? JSON.stringify({ dependencies: { fastify: '^5.0.0' } }) : null,
      getAllFiles: () => ['package.json'],
      fileExists: () => false,
    } as any;
    expect(fastifyResolver.detect(positive)).toBe(true);
describe('koa plugin (framework: Koa / @koa/router)', () => {
  it('detects @koa/router dependency and ignores express-only projects', () => {
    const positive = {
      readFile: (fp: string) =>
        fp === 'package.json'
          ? JSON.stringify({ dependencies: { koa: '^2.0.0', '@koa/router': '^12.0.0' } })
          : null,
      getAllFiles: () => ['package.json'],
      fileExists: () => false,
    } as any;
    expect(koaResolver.detect(positive)).toBe(true);

    const negative = {
      readFile: (fp: string) =>
        fp === 'package.json' ? JSON.stringify({ dependencies: { express: '^4.0.0' } }) : null,
      getAllFiles: () => ['package.json', 'src/app.js'],
      fileExists: () => false,
    } as any;
    expect(fastifyResolver.detect(negative)).toBe(false);
  });

  it('extracts fastify/demo task CRUD shorthand routes', () => {
    const result = fastifyResolver.extract!(
      'src/routes/api/tasks/index.ts',
      FASTIFY_DEMO_TASKS_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /:id',
      'GET /',
      'GET /:id',
      'PATCH /:id',
      'POST /',
    ]);
  });

  it('extracts hmake98 user router with named handler references', () => {
    const result = fastifyResolver.extract!(
      'src/routes/user.router.ts',
      HMAKE_FASTIFY_USER_ROUTER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'POST /login',
      'POST /signup',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'controllers.login',
      'controllers.signUp',
    ]);
  });

  it('applies same-file register() prefixes (fastify route-prefix example)', () => {
    const result = fastifyResolver.extract!(
      'examples/route-prefix.js',
      FASTIFY_ROUTE_PREFIX_EXAMPLE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /english/hello',
      'GET /italian/hello',
    ]);
  });

  it('extracts fastify.route({ method, url|path }) including method arrays', () => {
    const result = fastifyResolver.extract!('test/route.3.test.js', FASTIFY_ROUTE_OBJECT);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /foo/:an_id',
      'PATCH /items/:id',
      'PUT /items/:id',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('updateItem');
  });

  it('postExtract prepends cross-file register() prefixes', () => {
    const loginRoute = {
      id: 'route:src/routes/user.router.ts:10:POST:/login',
      kind: 'route' as const,
      name: 'POST /login',
      qualifiedName: 'src/routes/user.router.ts::route:POST:/login',
      filePath: 'src/routes/user.router.ts',
      language: 'typescript' as const,
      startLine: 10,
      endLine: 10,
    expect(koaResolver.detect(negative)).toBe(false);
  });

  it('extracts koajs/examples blog chained routes with named handlers', () => {
    const result = koaResolver.extract!('blog/app.js', KOA_EXAMPLES_BLOG_APP);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /',
      'GET /post/:id',
      'GET /post/new',
      'POST /post',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'add',
      'create',
      'list',
      'show',
    ]);
  });

  it('applies constructor prefix (embbnux/kails users routes)', () => {
    const result = koaResolver.extract!('app/routes/users.js', KAILS_USERS_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /users',
      'GET /users/logout',
      'GET /users/sign_in',
      'POST /users/sign_in',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'users.LogIn',
      'users.LogOut',
      'users.index',
      'users.signIn',
    ]);
  });

  it('applies constructor prefix and last-handler refs (kails articles)', () => {
    const result = koaResolver.extract!('app/routes/articles.js', KAILS_ARTICLES_ROUTES);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /articles/:id',
      'GET /articles/:id/edit',
      'GET /articles/new',
      'POST /articles',
      'PUT /articles/:id',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('articles.show');
    expect(result.references.map((r) => r.referenceName)).toContain('articles.create');
  });

  it('applies same-file nested .use() mount prefixes', () => {
    const result = koaResolver.extract!('routes.js', KOA_NESTED_MOUNT_EXAMPLE);
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/users',
      'GET /api/users/:id',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'getUser',
      'getUsers',
    ]);
  });

  it('postExtract prepends cross-file .use() mount prefixes', () => {
    const signInRoute = {
      id: 'route:app/routes/users.js:8:GET:/users/sign_in',
      kind: 'route' as const,
      name: 'GET /users/sign_in',
      qualifiedName: 'app/routes/users.js::route:GET:/users/sign_in',
      filePath: 'app/routes/users.js',
      language: 'javascript' as const,
      startLine: 8,
      endLine: 8,
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
      getNodesInFile: () => [loginRoute],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: (kind: string) => (kind === 'route' ? [loginRoute] : []),
      iterateNodesByKind: (kind: string) =>
        kind === 'route' ? [loginRoute][Symbol.iterator]() : [][Symbol.iterator](),
      fileExists: () => true,
      readFile: (fp: string) => {
        if (fp === 'src/main.ts') {
          return `
import fastify from 'fastify';
import userRouter from './routes/user.router';
const server = fastify();
server.register(userRouter, { prefix: '/api/user' });
      getNodesInFile: () => [signInRoute],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: (kind: string) => (kind === 'route' ? [signInRoute] : []),
      iterateNodesByKind: (kind: string) =>
        kind === 'route' ? [signInRoute][Symbol.iterator]() : [][Symbol.iterator](),
      fileExists: () => true,
      readFile: (fp: string) => {
        if (fp === 'app/index.js') {
          return `
import Router from '@koa/router';
import users from './routes/users';
const api = new Router({ prefix: '/api' });
api.use(users.routes());
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
      getAllFiles: () => ['src/main.ts', 'src/routes/user.router.ts'],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = fastifyResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('POST /api/user/login');
describe('jaxrs plugin (framework: JAX-RS / Quarkus / Jersey / Dropwizard)', () => {
  it('extracts dropwizard HelloWorldResource class+method @Path', () => {
    const result = jaxrsResolver.extract!(
      'dropwizard-example/src/main/java/com/example/helloworld/resources/HelloWorldResource.java',
      DROPWIZARD_HELLO_WORLD_RESOURCE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /hello-world',
      'GET /hello-world/date',
      'POST /hello-world',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'receiveDate',
      'receiveHello',
      'sayHello',
    ]);
  });

  it('extracts dropwizard PersonResource path-param composition', () => {
    const result = jaxrsResolver.extract!(
      'dropwizard-example/src/main/java/com/example/helloworld/resources/PersonResource.java',
      DROPWIZARD_PERSON_RESOURCE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /people/{personId}',
      'GET /people/{personId}/view_freemarker',
      'GET /people/{personId}/view_mustache',
    ]);
  });

  it('extracts quarkus GreetingResource (@Path after @GET)', () => {
    const result = jaxrsResolver.extract!(
      'getting-started/src/main/java/org/acme/getting/started/GreetingResource.java',
      QUARKUS_GREETING_RESOURCE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /hello',
      'GET /hello/greeting/{name}',
    ]);
  });

  it('extracts quarkus FruitResource GET/POST/DELETE', () => {
    const result = jaxrsResolver.extract!(
      'rest-json-quickstart/src/main/java/org/acme/rest/json/FruitResource.java',
      QUARKUS_FRUIT_RESOURCE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /fruits',
      'GET /fruits',
      'POST /fruits',
    ]);
  });

  it('detects via pom.xml jakarta.ws.rs and rejects spring-only projects', () => {
    const positive = {
      getAllFiles: () => ['pom.xml'],
      readFile: (f: string) =>
        f === 'pom.xml'
          ? '<dependency><groupId>jakarta.ws.rs</groupId><artifactId>jakarta.ws.rs-api</artifactId></dependency>'
          : null,
      fileExists: () => false,
    };
    expect(jaxrsResolver.detect!(positive as any)).toBe(true);

    const negative = {
      getAllFiles: () => ['pom.xml', 'src/Main.java'],
      readFile: (f: string) => {
        if (f === 'pom.xml') {
          return '<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>';
        }
        if (f.endsWith('.java')) {
          return '@RestController class Main { @GetMapping("/x") public String x() { return ""; } }';
        }
        return null;
      },
      fileExists: () => false,
    };
    expect(jaxrsResolver.detect!(negative as any)).toBe(false);
describe('micronaut plugin (framework: Micronaut)', () => {
  it('extracts kestra MiscController (@Get path + @Post uri=)', () => {
    const result = micronautResolver.extract!(
      'webserver/src/main/java/io/kestra/webserver/controllers/api/MiscController.java',
      KESTRA_MISC_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/configs',
      'GET /api/v1/configs/login',
      'GET /api/v1/{tenant}/usages/all',
      'POST /api/v1/login',
      'POST /api/v1/{tenant}/basicAuth',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'createBasicAuth',
      'getConfiguration',
      'getLoginConfiguration',
      'getUsages',
      'login',
    ]);
  });

  it('extracts kestra ClusterController (relative method path without leading slash)', () => {
    const result = micronautResolver.extract!(
      'webserver/src/main/java/io/kestra/webserver/controllers/api/ClusterController.java',
      KESTRA_CLUSTER_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /api/v1/{tenant}/cluster/metrics/{serviceType}',
      'GET /api/v1/{tenant}/cluster/services/{id}',
    ]);
  });

  it('extracts kestra KVController (Get/Put/Delete + uri= + consumes media type)', () => {
    const result = micronautResolver.extract!(
      'webserver/src/main/java/io/kestra/webserver/controllers/api/KVController.java',
      KESTRA_KV_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/v1/{tenant}/namespaces/{namespace}/kv',
      'DELETE /api/v1/{tenant}/namespaces/{namespace}/kv/{key}',
      'GET /api/v1/{tenant}/kv',
      'GET /api/v1/{tenant}/namespaces/{namespace}/kv/{key}',
      'PUT /api/v1/{tenant}/namespaces/{namespace}/kv/{key}',
    ]);
  });

  it('extracts asc-lab HelloController (bare @Get defaults to controller prefix)', () => {
    const result = micronautResolver.extract!(
      'policy-service/src/main/java/pl/altkom/asc/lab/micronaut/poc/policy/infrastructure/adapters/web/HelloController.java',
      ASC_LAB_HELLO_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /hello',
      'GET /hello/version',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual(['index', 'version']);
  });

  it('extracts asc-lab OfferGatewayController (@Post value=/ + consumes)', () => {
    const result = micronautResolver.extract!(
      'agent-portal-gateway/src/main/java/pl/altkom/asc/lab/micronaut/poc/gateway/OfferGatewayController.java',
      ASC_LAB_OFFER_GATEWAY_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['POST /api/offers']);
    expect(result.references.map((r) => r.referenceName)).toEqual(['create']);
  });

  it('extracts mill Kotlin HelloController (bare @Get + @Produces)', () => {
    const result = micronautResolver.extract!(
      'micronaut/src/HelloController.kt',
      MILL_MICRONAUT_HELLO_KT
    );
    expect(result.nodes.map((n) => n.name)).toEqual(['GET /hello']);
    expect(result.references.map((r) => r.referenceName)).toEqual(['index']);
  });

  it('detects Micronaut via build.gradle and rejects Spring-only projects', () => {
    const micronautCtx = {
      getAllFiles: () => ['build.gradle', 'src/main/java/App.java'],
      readFile: (fp: string) => {
        if (fp === 'build.gradle') {
          return `dependencies { implementation("io.micronaut:micronaut-http-server-netty") }`;
        }
        return null;
      },
      fileExists: () => false,
      getProjectRoot: () => '/mn',
describe('litestar plugin (framework: Litestar)', () => {
  it('extracts nllb-api TranslatorController (Controller.path + positional paths)', () => {
    const result = litestarResolver.extract!(
      'server/api/v4/translator.py',
      NLLB_TRANSLATOR_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /translator',
      'GET /translator',
      'GET /translator/stream',
      'GET /translator/tokens',
      'POST /translator',
      'PUT /translator',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('tokens');
  });

  it('extracts litestar-fullstack UserController (path= kwarg + typed params)', () => {
    const result = litestarResolver.extract!(
      'src/py/app/domain/accounts/controllers/_user.py',
      LITESTAR_FULLSTACK_USER_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/users/{user_id}',
      'GET /api/users',
      'GET /api/users/{user_id}',
      'PATCH /api/users/{user_id}',
      'POST /api/users',
    ]);
  });

  it('extracts litestar-fullstack TeamController (absolute path= on handlers)', () => {
    const result = litestarResolver.extract!(
      'src/py/app/domain/teams/controllers/_team.py',
      LITESTAR_FULLSTACK_TEAM_CONTROLLER
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /api/teams/{team_id}',
      'GET /api/teams',
      'GET /api/teams/{team_id}',
      'PATCH /api/teams/{team_id}',
      'POST /api/teams',
    ]);
  });

  it('extracts @route(http_method=…) and applies Router path in postExtract', () => {
    const filePath = 'app/routes.py';
    const extracted = litestarResolver.extract!(filePath, LITESTAR_ROUTE_AND_ROUTER);
    expect(extracted.nodes.map((n) => n.name).sort()).toEqual([
      'GET /health',
      'GET /{order_id}',
      'HEAD /health',
    ]);

    const ctx = {
      getNodesInFile: () => extracted.nodes,
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: (kind: string) => (kind === 'route' ? extracted.nodes : []),
      iterateNodesByKind: (kind: string) =>
        (kind === 'route' ? extracted.nodes : [])[Symbol.iterator](),
      fileExists: () => true,
      readFile: (fp: string) => (fp === filePath ? LITESTAR_ROUTE_AND_ROUTER : null),
      getProjectRoot: () => '/test',
      getAllFiles: () => [filePath],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = litestarResolver.postExtract!(ctx as any);
    expect(updates.map((n) => n.name).sort()).toEqual(['GET /orders/{order_id}']);
  });

  it('detects litestar via pyproject.toml and rejects unrelated projects', () => {
    const positive = {
      readFile: (f: string) =>
        f === 'pyproject.toml' ? '[project]\ndependencies = ["litestar>=2"]\n' : null,
      fileExists: () => false,
      getAllFiles: () => ['pyproject.toml'],
      getNodesByName: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByKind: () => [],
      iterateNodesByKind: () => [][Symbol.iterator](),
      getNodesInFile: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(micronautResolver.detect(micronautCtx as any)).toBe(true);

    const springCtx = {
      ...micronautCtx,
      getAllFiles: () => ['pom.xml', 'src/main/java/App.java'],
      readFile: (fp: string) => {
        if (fp === 'pom.xml') {
          return `<dependency><groupId>org.springframework.boot</groupId></dependency>`;
        }
        return `import org.springframework.web.bind.annotation.RestController;\n@RestController\nclass App {}`;
      },
    };
    expect(micronautResolver.detect(springCtx as any)).toBe(false);
  });

  it('does not extract Spring @GetMapping as Micronaut routes', () => {
    const spring = `
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UsersController {
  @GetMapping("/users")
  public String list() { return ""; }
}
`;
    const result = micronautResolver.extract!('UsersController.java', spring);
    expect(result.nodes).toEqual([]);
      getAllFiles: () => ['app/index.js', 'app/routes/users.js'],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    const updates = koaResolver.postExtract!(ctx as any);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.name).toBe('GET /api/users/sign_in');
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
      getProjectRoot: () => '/test',
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
    };
    expect(litestarResolver.detect!(positive as any)).toBe(true);

    const negative = {
      ...positive,
      readFile: (f: string) =>
        f === 'pyproject.toml' ? '[project]\ndependencies = ["fastapi"]\n' : null,
      getAllFiles: () => ['main.py'],
    };
    expect(litestarResolver.detect!(negative as any)).toBe(false);
  });
});
