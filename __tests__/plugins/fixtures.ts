/**
 * Real-repository fixtures for framework plugins.
 * Each snippet is trimmed from the cited path; keep attribution when updating.
 */

/** https://github.com/lightdash/lightdash — packages/backend/src/controllers/sshController.ts */
export const LIGHTHASH_SSH_CONTROLLER = `
import {
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from './baseController';

@Route('/api/v1/ssh')
@Response('default', 'Error')
@Tags('SSH Keypairs')
export class SshController extends BaseController {
    @Middlewares([])
    @SuccessResponse('201', 'Success')
    @Post('key-pairs')
    @OperationId('createSshKeyPair')
    async createSshKeyPair(
        @Request() req: express.Request,
    ): Promise<unknown> {
        return {};
    }
}
`;

/** https://github.com/lukeautry/tsoa — tests/fixtures/controllers/getController.ts */
export const TSOA_OFFICIAL_GET_CONTROLLER = `
import { Controller, Get, Route, SuccessResponse } from '@tsoa/runtime';

@Route('GetTest')
export class GetTestController extends Controller {
  @Get()
  @SuccessResponse('200', 'Returns TestModel')
  public async getModel(): Promise<void> {}

  @Get('{id}')
  public async getModelById(id: number): Promise<void> {}
}
`;

/** https://github.com/lukeautry/tsoa — tests/fixtures/controllers/rootController.ts */
export const TSOA_OFFICIAL_ROOT_CONTROLLER = `
import { Controller, Get, Route } from '@tsoa/runtime';

@Route()
export class RootController extends Controller {
  @Get()
  public async rootHandler(): Promise<void> {}
}
`;

/** Inherited @Route prefix — child controller without its own @Route decorator. */
export const TSOA_INHERITED_ROUTE_CONTROLLER = `
import { Controller, Get, Post, Route } from '@tsoa/runtime';

@Route('/api/v1/shared')
export class SharedRoutesController extends Controller {
  @Get('health')
  public async health(): Promise<void> {}
}

export class ChildRoutesController extends SharedRoutesController {
  @Post('widgets')
  public async createWidget(): Promise<void> {}
}
`;

/** https://github.com/lightdash/lightdash — packages/backend/src/controllers/userAvatarController.ts (trimmed) */
export const LIGHTDASH_MULTI_ROUTE_FILE = `
import { Delete, Get, Put, Route } from '@tsoa/runtime';
import { BaseController } from './baseController';

@Route('/api/v1/user/me/avatar')
export class UserAvatarController extends BaseController {
  @Put('/')
  async updateAvatar(): Promise<void> {}

  @Delete('/')
  async deleteAvatar(): Promise<void> {}
}

@Route('/api/v1/users')
export class UsersAvatarController extends BaseController {
  @Get('/{userUuid}/avatar/{contentHash}')
  async getAvatar(): Promise<void> {}
}
`;

/** https://github.com/formbricks/formbricks — apps/web/app/api/v2/health/route.ts */
export const FORMBRICKS_HEALTH_ROUTE_REEXPORT = `export { GET } from "@/modules/api/v2/health/route";
`;

/** https://github.com/calcom/cal.com — apps/web/app/api/auth/signup/route.ts (export line) */
export const CALCOM_SIGNUP_ROUTE_CONST = `
import { NextResponse, type NextRequest } from "next/server";

async function handler(req: NextRequest) {
  return NextResponse.json({ ok: true });
}

export const POST = handler;
`;

/** https://github.com/novuhq/novu — apps/api/src/app/widgets/widgets.controller.ts (trimmed) */
export const NOVU_WIDGETS_CONTROLLER = `
@ApiCommonResponses()
@Controller('/widgets')
export class WidgetsController {
  @Post('/session/initialize')
  async sessionInitialize(@Body() body: SessionInitializeRequestDto) {}

  @Get('/notifications/feed')
  async getNotificationsFeed() {}

  @Get('/notifications/unseen')
  async getUnseenCount() {}
}
`;

/** https://github.com/twentyhq/twenty — packages/twenty-server/src/engine/core-modules/health/controllers/health.controller.ts */
export const TWENTY_HEALTH_CONTROLLER = `
@Controller('healthz')
export class HealthController {
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
`;

/** https://github.com/twentyhq/twenty — object-metadata.resolver.ts (@MetadataResolver + @ResolveField) */
export const TWENTY_OBJECT_METADATA_RESOLVER = `
@MetadataResolver(() => ObjectMetadataDTO)
export class ObjectMetadataResolver {
  @ResolveField(() => Boolean, {
    deprecationReason: 'Use isUIEditable',
  })
  async isUIReadOnly(@Parent() objectMetadata: ObjectMetadataDTO): Promise<boolean> {
    return !objectMetadata.isUIEditable;
  }

  @Query(() => [ObjectRecordCountDTO])
  async objectRecordCounts(): Promise<ObjectRecordCountDTO[]> {
    return [];
  }
}
`;

/** https://github.com/shadcn-ui/taxonomy — app/api/posts/route.ts */
export const TAXONOMY_POSTS_ROUTE_FUNCTION = `
export async function GET() {
  return new Response(JSON.stringify([]));
}

export async function POST() {
  return new Response(null, { status: 201 });
}
`;

/** NestJS URI versioning — @Controller({ path, version }) + @Version on method */
export const NEST_VERSIONED_CONTROLLER = `
@Controller({ path: 'cats', version: '1' })
export class CatsV1Controller {
  @Get()
  findAll() {}

  @Version('2')
  @Get('beta')
  findAllV2() {}
}
`;

/** https://github.com/mattermost/mattermost — server/channels/api4/user.go (InitUser) */
export const MATTERMOST_USER_ROUTE_REGISTRATIONS = `
func InitUser(api *API) {
 api.BaseRoutes.Users.Handle("", api.APIHandler(createUser)).Methods(http.MethodPost)
 api.BaseRoutes.Users.Handle("/ids", api.APISessionRequired(getUsersByIds)).Methods(http.MethodPost)
 api.BaseRoutes.User.Handle("", api.APISessionRequired(getUser)).Methods(http.MethodGet)
}
`;

/** https://github.com/mattermost/mattermost — server/channels/api4/api.go (Routes struct + PathPrefix) */
export const MATTERMOST_API_ROUTES_STRUCT = `
type Routes struct {
 Users *mux.Router // 'api/v4/users'
 User *mux.Router // 'api/v4/users/{user_id:[A-Za-z0-9]+}'
}

func Init(srv *Server) {
 api.BaseRoutes.Users = api.BaseRoutes.ApiRoot.PathPrefix("/users").Subrouter()
 api.BaseRoutes.User = api.BaseRoutes.ApiRoot.PathPrefix("/users/{user_id:[A-Za-z0-9]+}").Subrouter()
}
`;

/** https://github.com/flipped-aurora/gin-vue-admin — server/router/example/exa_customer.go */
export const GIN_VUE_ADMIN_GROUP_ROUTE = `
func InitCustomerRouter(Router *gin.RouterGroup) {
 customerRouter := Router.Group("customer")
 {
  customerRouter.POST("/customer", exaCustomerApi.CreateExaCustomer)
  customerRouter.GET("/customer", exaCustomerApi.GetExaCustomer)
 }
}
`;

/** https://github.com/go-chi/chi — _examples/rest/rest.go (representative) */
export const CHI_METHODS_ROUTE = `
r.Method("GET", "/articles/{articleID}", getArticle)
r.Methods([]string{"GET", "POST"}, "/search", searchArticles)
`;

/** https://github.com/appwrite/appwrite — app/controllers/api/locale.php */
export const APPWRITE_LOCALE_ROUTES = `
Http::get('/v1/locale')
    ->desc('Get user locale')
    ->groups(['api', 'locale'])
    ->action(function () {});

Http::get('/v1/locale/codes')
    ->desc('List locale codes')
    ->groups(['api', 'locale'])
    ->action(function () {});

Http::post('/v1/locale/currencies')
    ->desc('List currencies')
    ->groups(['api', 'locale'])
    ->action(function () {});
`;

/** https://github.com/appwrite/appwrite — src/Appwrite/Platform/Modules/Functions/Http/Deployments/Vcs/Create.php */
export const APPWRITE_PLATFORM_VCS_CREATE = `
class Create extends Base
{
    use HTTP;

    public function __construct()
    {
        $this
            ->setHttpMethod(Action::HTTP_REQUEST_METHOD_POST)
            ->setHttpPath('/v1/functions/:functionId/deployments/vcs')
            ->desc('Create VCS deployment')
            ->callback($this->action(...));
    }
}
`;

/** https://github.com/firefly-iii/firefly-iii — routes/web.php (Passport group) */
export const FIREFLY_PASSPORT_ROUTES = `
Route::post('/personal-access-tokens', ['uses' => 'FireflyIII\\Http\\Controllers\\Profile\\OAuthController@storePersonalAccessToken', 'as' => 'personal.tokens.store']);
Route::get('/personal-access-tokens', ['uses' => 'FireflyIII\\Http\\Controllers\\Profile\\OAuthController@listPersonalAccessTokens', 'as' => 'personal.tokens.index']);
Route::delete('/personal-access-tokens/{token_id}', ['uses' => 'FireflyIII\\Http\\Controllers\\Profile\\OAuthController@destroyPersonalAccessToken', 'as' => 'personal.tokens.destroy']);
`;

/**
 * https://github.com/symfony/demo — src/Controller/BlogController.php
 * (trimmed; PHP 8 attributes + class-level prefix)
 */
export const SYMFONY_DEMO_BLOG_CONTROLLER = `
<?php
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Routing\\Requirement\\Requirement;

#[Route('/blog')]
final class BlogController extends AbstractController
{
    #[Route('/', name: 'blog_index', defaults: ['page' => '1', '_format' => 'html'], methods: ['GET'])]
    #[Route('/rss.xml', name: 'blog_rss', defaults: ['page' => '1', '_format' => 'xml'], methods: ['GET'])]
    #[Route('/page/{page}', name: 'blog_index_paginated', defaults: ['_format' => 'html'], requirements: ['page' => Requirement::POSITIVE_INT], methods: ['GET'])]
    public function index(): Response
    {
        return new Response();
    }

    #[Route('/posts/{slug:post}', name: 'blog_post', requirements: ['slug' => Requirement::ASCII_SLUG], methods: ['GET'])]
    public function postShow(): Response
    {
        return new Response();
    }

    #[Route('/comment/{postSlug}/new', name: 'comment_new', methods: ['POST'])]
    public function commentNew(): Response
    {
        return new Response();
    }

    #[Route('/search', name: 'blog_search', methods: ['GET'])]
    public function search(): Response
    {
        return new Response();
    }
}
`;

/**
 * https://github.com/symfony/demo (v1.6.3) — src/Controller/BlogController.php
 * Legacy Sensio/Annotation \`@Route\` docblock form.
 */
export const SYMFONY_DEMO_BLOG_ANNOTATIONS = `
<?php
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Annotation\\Route;

/**
 * @Route("/blog")
 */
class BlogController extends AbstractController
{
    /**
     * @Route("/", defaults={"page": "1", "_format"="html"}, methods="GET", name="blog_index")
     * @Route("/rss.xml", defaults={"page": "1", "_format"="xml"}, methods="GET", name="blog_rss")
     * @Route("/page/{page<[1-9]\\\\d*>}", defaults={"_format"="html"}, methods="GET", name="blog_index_paginated")
     */
    public function index(): Response
    {
        return new Response();
    }

    /**
     * @Route("/posts/{slug}", methods="GET", name="blog_post")
     */
    public function postShow(): Response
    {
        return new Response();
    }

    /**
     * @Route("/comment/{postSlug}/new", methods="POST", name="comment_new")
     */
    public function commentNew(): Response
    {
        return new Response();
    }
}
`;

/**
 * https://github.com/Sylius/Sylius — src/Sylius/Bundle/ShopBundle/Resources/config/routing/cart.yml
 * (concrete YAML routes with methods + _controller)
 */
export const SYMFONY_SYLIUS_CART_YAML = `
sylius_shop_cart_summary:
    path: /
    methods: [GET]
    defaults:
        _controller: sylius.controller.order::summaryAction

sylius_shop_cart_checkout:
    path: /checkout
    methods: [PATCH]
    defaults:
        _controller: sylius.controller.order::saveAction

# Import-only entry — must not invent a route path
sylius_shop_cart_ajax:
    resource: "@SyliusShopBundle/Resources/config/routing/cart_ajax.yml"
    prefix: /ajax
`;

/**
 * Symfony docs — XML route table (still present in older apps; deprecated in 7.4+)
 * https://symfony.com/doc/7.4/routing.html
 */
export const SYMFONY_DOCS_ROUTES_XML = `
<?xml version="1.0" encoding="UTF-8" ?>
<routes xmlns="http://symfony.com/schema/routing"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://symfony.com/schema/routing
            https://symfony.com/schema/routing/routing-1.0.xsd">
    <route id="blog_list" path="/blog" controller="App\\Controller\\BlogController::list" methods="GET"/>
    <route id="blog_show" path="/blog/{slug}" controller="App\\Controller\\BlogController::show" methods="GET|HEAD"/>
</routes>
`;
