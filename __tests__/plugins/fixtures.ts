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

/** https://github.com/gofiber/recipes — auth-jwt/router/router.go (SetupRoutes) */
export const FIBER_AUTH_JWT_ROUTES = `
func SetupRoutes(app *fiber.App) {
	api := app.Group("/api", logger.New())
	api.Get("/", handlers.Hello)

	auth := api.Group("/auth")
	auth.Post("/login", authHandler.Login)
	auth.Post("/register", authHandler.Register)
	auth.Post("/logout", middleware.Protected(), authHandler.Logout)
	auth.Post("/refresh-token", authHandler.RefreshToken)

	user := api.Group("/users")
	user.Get("/:id", middleware.Protected(), userHandler.GetUser)
	user.Patch("/:id", middleware.Protected(), userHandler.UpdateUser)
	user.Delete("/:id", middleware.Protected(), userHandler.DeleteUser)

	product := api.Group("/products")
	product.Get("/", productHandler.GetAllProducts)
	product.Get("/:id", productHandler.GetProduct)
	product.Post("/", middleware.Protected(), productHandler.CreateProduct)
	product.Delete("/:id", middleware.Protected(), productHandler.DeleteProduct)
}
`;

/** https://github.com/gofiber/boilerplate — app.go (v1 group + static catch-all skipped) */
export const FIBER_BOILERPLATE_APP = `
func main() {
	app := fiber.New(fiber.Config{})
	v1 := app.Group("/api/v1")
	v1.Get("/users", handlers.UserList)
	v1.Post("/users", handlers.UserCreate)
	app.Get("/*", static.New("./static/public"))
	app.Use(handlers.NotFound)
}
`;

/** Fiber docs — Route callback + Add multi-method (https://docs.gofiber.io/guide/routing/) */
export const FIBER_ROUTE_CALLBACK_AND_ADD = `
func main() {
	app := fiber.New()
	app.Route("/api/v1", func(r fiber.Router) {
		r.Get("/users", listUsers)
		r.Post("/users", createUser)
	}, "v1.")
	app.Add([]string{"GET", "POST"}, "/health", healthCheck)
	app.All("/ping", ping)
}
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

/** https://github.com/honojs/examples — blog/src/api.ts */
export const HONO_EXAMPLES_BLOG_API = `
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Bindings } from './bindings'
import * as model from './model'

const api = new Hono<{ Bindings: Bindings }>()
api.use('/posts/*', cors())

api.get('/', (c) => {
  return c.json({ message: 'Hello' })
})

api.get('/posts', async (c) => {
  const posts = await model.getPosts(c.env.BLOG_EXAMPLE)
  return c.json({ posts: posts, ok: true })
})

api.post('/posts', async (c) => {
  const param = await c.req.json()
  const newPost = await model.createPost(c.env.BLOG_EXAMPLE, param as model.Param)
  if (!newPost) {
    return c.json({ error: 'Can not create new post', ok: false }, 422)
  }
  return c.json({ post: newPost, ok: true }, 201)
})

api.get('/posts/:id', async (c) => {
  const id = c.req.param('id')
  const post = await model.getPost(c.env.BLOG_EXAMPLE, id)
  if (!post) {
    return c.json({ error: 'Not Found', ok: false }, 404)
  }
  return c.json({ post: post, ok: true })
})

api.put('/posts/:id', async (c) => {
  const id = c.req.param('id')
  const post = await model.getPost(c.env.BLOG_EXAMPLE, id)
  if (!post) {
    return new Response(null, { status: 204 })
  }
  const param = await c.req.json()
  const success = await model.updatePost(c.env.BLOG_EXAMPLE, id, param as model.Param)
  return c.json({ ok: success })
})

api.delete('/posts/:id', async (c) => {
  const id = c.req.param('id')
  const post = await model.getPost(c.env.BLOG_EXAMPLE, id)
  if (!post) {
    return new Response(null, { status: 204 })
  }
  const success = await model.deletePost(c.env.BLOG_EXAMPLE, id)
  return c.json({ ok: success })
})

export default api
`;

/** https://github.com/honojs/examples — blog/src/index.ts (mount + root) */
export const HONO_EXAMPLES_BLOG_INDEX = `
import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { prettyJSON } from 'hono/pretty-json'
import api from './api'
import { Bindings } from './bindings'

const app = new Hono()
app.get('/', (c) => c.text('Pretty Blog API'))
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404))

const middleware = new Hono<{ Bindings: Bindings }>()
middleware.use('*', prettyJSON())
middleware.use('/posts/*', async (c, next) => {
  if (c.req.method !== 'GET') {
    const auth = basicAuth({ username: c.env.USERNAME, password: c.env.PASSWORD })
    return auth(c, next)
  } else {
    await next()
  }
})

app.route('/api', middleware)
app.route('/api', api)

export default app
`;

/** https://github.com/honojs/examples — basic/src/index.ts (same-file sub-router + verbs) */
export const HONO_EXAMPLES_BASIC = `
import { Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'

const app = new Hono()

app.get('/', (c) => c.text('Hono!!'))
app.get('/hello', () => new Response('This is /hello'))
app.get('/entry/:id', (c) => {
  const id = c.req.param('id')
  return c.text(\`Your ID is \${id}\`)
})

const book = new Hono()
book.get('/', (c) => c.text('List Books'))
book.get('/:id', (c) => {
  const id = c.req.param('id')
  return c.text('Get Book: ' + id)
})
book.post('/', (c) => c.text('Create Book'))
app.route('/book', book)

app.get('/api/posts', prettyJSON(), (c) => {
  return c.json([])
})
app.post('/api/posts', (c) => c.json({ message: 'Created!' }, 201))

export default app
`;

/** https://github.com/honojs/examples — docs patterns: basePath + chained + app.on */
export const HONO_BASEPATH_CHAIN_ON = `
import { Hono } from 'hono'

const api = new Hono().basePath('/api/v1')
api.get('/users', listUsers)
api.post('/users', createUser)

const app = new Hono()
app
  .get('/endpoint', (c) => c.text('GET /endpoint'))
  .post((c) => c.text('POST /endpoint'))
  .delete((c) => c.text('DELETE /endpoint'))

app.on('PURGE', '/cache', purgeCache)
app.on(['PUT', 'DELETE'], '/post', mutatePost)
app.route('/', api)

export default app
/** https://github.com/PatilShreyas/NotyKT — noty-api/.../route/NoteRouter.kt (trimmed) */
export const NOTYKT_NOTE_ROUTER = `
package dev.shreyaspatil.noty.api.route

import io.ktor.server.auth.authenticate
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.notes() {
    authenticate {
        route("/notes/") {
            get {
                call.respond(notesResponse)
            }

            post {
                call.respond(noteResponse)
            }

            route("/{id}") {
                put {
                    call.respond(noteResponse)
                }

                delete {
                    call.respond(noteResponse)
                }

                route("/pin") {
                    put {
                        call.respond(pinned)
                    }
                    delete {
                        call.respond(unpinned)
                    }
                }
            }
        }
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

/** https://github.com/raharrison/kotlin-ktor-exposed-starter — src/main/kotlin/web/WidgetResource.kt (trimmed) */
export const KTOR_STARTER_WIDGET_RESOURCE = `
package web

import io.ktor.server.routing.*

fun Route.widget(widgetService: WidgetService) {

    route("/widgets") {

        get {
            call.respond(widgetService.getAllWidgets())
        }

        get("/{id}") {
            call.respond(widget)
        }

        post {
            call.respond(HttpStatusCode.Created, widgetService.addWidget(widget))
        }

        put {
            call.respond(HttpStatusCode.OK, updated)
        }

        delete("/{id}") {
            call.respond(HttpStatusCode.OK)
        }

    }

    webSocket("/updates") {
        // websocket — not an HTTP verb route
    }
}
`;

/** https://github.com/ktorio/ktor-samples — mvc-web/.../plugins/Routing.kt (trimmed) */
export const KTOR_SAMPLES_WISH_ROUTING = `
package com.example.plugins

import io.ktor.server.application.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    routing {
        route("wish") {
            post("make") {
                call.respondRedirect("/wish/list")
            }
            get("list") {
                call.respond(wishList)
            }
            post("cancel") {
                call.respondRedirect("/wish/list")
            }
            get("topwishes") {
                call.respond(topWishList)
            }
        }
    }
}
/** https://github.com/antirez/lamernews — app.rb (trimmed top-level Sinatra DSL) */
export const LAMERNEWS_SINATRA_ROUTES = `
require 'sinatra'
require 'json'

get '/' do
  'top'
end

get '/latest/:start' do
  'latest'
end

post '/api/submit' do
  'submit'
end

get  '/api/getnews/:sort/:start/:count' do
  'news'
end
`;

/** https://github.com/stevekinney/pizza — api/v1/pizzerias.rb (nested Sinatra::Namespace) */
export const PIZZA_SINATRA_NAMESPACE_ROUTES = `
require 'sinatra'
require 'sinatra/namespace'

class API < Sinatra::Base
  configure do
    register Sinatra::Namespace
  end

  namespace '/api' do
    namespace '/v1' do
      get '/pizzerias' do
        content_type :json
        '[]'
      end

      get '/pizzerias/:id' do
        content_type :json
        json = '{}'
        if json == 'null'
          raise Sinatra::NotFound
        else
          json
        end
      end

      get '/properties/search' do
        content_type :json
        '[]'
      end
    end
  end
end
`;

/**
 * https://github.com/ruby-grape/grape — README Twitter API example (trimmed).
 * Header versioning must NOT appear in the path; prefix + resource + route_param do.
 */
export const GRAPE_README_TWITTER_API = `
module Twitter
  class API < Grape::API
    version 'v1', using: :header, vendor: 'twitter'
    format :json
    prefix :api

    helpers do
      def current_user
        nil
      end
    end

    resource :statuses do
      desc 'Return a public timeline.'
      get :public_timeline do
        []
      end

      desc 'Return a personal timeline.'
      get :home_timeline do
        []
      end

      desc 'Return a status.'
      params do
        requires :id, type: Integer
      end
      route_param :id do
        get do
          {}
        end
      end

      desc 'Create a status.'
      post do
        {}
      end

      desc 'Update a status.'
      put ':id' do
        {}
      end

      desc 'Delete a status.'
      delete ':id' do
        {}
      end
    end
  end
end
`;

/** https://github.com/ruby-grape/grape-on-rack — api/ping.rb + app/api.rb mount/prefix */
export const GRAPE_ON_RACK_PING = `
module Acme
  class Ping < Grape::API
    format :json
    get '/ping' do
      { ping: 'pong' }
    end
  end
end
`;

export const GRAPE_ON_RACK_API_MOUNT = `
module Acme
  class API < Grape::API
    prefix 'api'
    format :json
    mount ::Acme::Ping
  end
end
`;

/** https://github.com/ruby-grape/grape-on-rack — api/post_put.rb (symbol paths) */
export const GRAPE_ON_RACK_POST_PUT = `
module Acme
  class PostPut < Grape::API
    format :json
    get :ring do
      { rang: 0 }
    end
    post :ring do
      { rang: 1 }
    end
    put :ring do
      { rang: 2 }
    end
  end
end
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
