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
/** https://github.com/dropwizard/dropwizard — dropwizard-example/src/main/java/com/example/helloworld/resources/HelloWorldResource.java */
export const DROPWIZARD_HELLO_WORLD_RESOURCE = `
package com.example.helloworld.resources;

import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("/hello-world")
@Produces(MediaType.APPLICATION_JSON)
public class HelloWorldResource {
    @GET
    public Saying sayHello() {
        return null;
    }

    @POST
    public void receiveHello(Saying saying) {
    }

    @GET
    @Path("/date")
    @Produces(MediaType.TEXT_PLAIN)
    public String receiveDate() {
        return null;
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
/** https://github.com/dropwizard/dropwizard — dropwizard-example/src/main/java/com/example/helloworld/resources/PersonResource.java */
export const DROPWIZARD_PERSON_RESOURCE = `
package com.example.helloworld.resources;

import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

@Path("/people/{personId}")
@Produces(MediaType.APPLICATION_JSON)
public class PersonResource {
    @GET
    public Person getPerson(@PathParam("personId") long personId) {
        return null;
    }

    @GET
    @Path("/view_freemarker")
    @Produces(MediaType.TEXT_HTML)
    public PersonView getPersonViewFreemarker(@PathParam("personId") long personId) {
        return null;
    }

    @GET
    @Path("/view_mustache")
    @Produces(MediaType.TEXT_HTML)
    public PersonView getPersonViewMustache(@PathParam("personId") long personId) {
        return null;
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
/** https://github.com/quarkusio/quarkus-quickstarts — getting-started/src/main/java/org/acme/getting/started/GreetingResource.java */
export const QUARKUS_GREETING_RESOURCE = `
package org.acme.getting.started;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/hello")
public class GreetingResource {
    @GET
    @Produces(MediaType.TEXT_PLAIN)
    @Path("/greeting/{name}")
    public String greeting(String name) {
        return name;
    }

    @GET
    @Produces(MediaType.TEXT_PLAIN)
    public String hello() {
        return "hello";
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
/** https://github.com/fastify/demo — src/routes/api/tasks/index.ts (trimmed to CRUD verbs) */
export const FASTIFY_DEMO_TASKS_ROUTES = `
import {
  FastifyPluginAsyncTypebox,
  Type
} from '@fastify/type-provider-typebox'
import {
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskStatusEnum,
  QueryTaskPaginationSchema,
  TaskPaginationResultSchema
} from '../../../schemas/tasks.js'

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { tasksRepository, tasksFileManager } = fastify
  fastify.get(
    '/',
    {
      schema: {
        querystring: QueryTaskPaginationSchema,
        response: {
          200: TaskPaginationResultSchema
        },
        tags: ['Tasks']
      }
    },
    async function (request) {
      return tasksRepository.paginate(request.query)
    }
  )

  fastify.get(
    '/:id',
    {
      schema: {
        params: Type.Object({
          id: Type.Number()
        }),
        response: {
          200: TaskSchema,
          404: Type.Object({ message: Type.String() })
        },
        tags: ['Tasks']
      }
    },
    async function (request, reply) {
      const { id } = request.params
      const task = await tasksRepository.findById(id)
      if (!task) {
        return reply.notFound('Task not found')
      }
      return task
    }
  )

  fastify.post(
    '/',
    {
      schema: {
        body: CreateTaskSchema,
        response: {
          201: {
            id: Type.Number()
          }
        },
        tags: ['Tasks']
      }
    },
    async function (request, reply) {
      const id = await tasksRepository.create(request.body)
      reply.code(201)
      return { id }
    }
  )

  fastify.patch(
    '/:id',
    {
      schema: {
        params: Type.Object({
          id: Type.Number()
        }),
        body: UpdateTaskSchema,
        response: {
          200: TaskSchema,
          404: Type.Object({ message: Type.String() })
        },
        tags: ['Tasks']
      }
    },
    async function (request, reply) {
      return tasksRepository.update(request.params.id, request.body)
    }
  )

  fastify.delete(
    '/:id',
    {
      schema: {
        params: Type.Object({
          id: Type.Number()
        }),
        response: {
          204: Type.Null(),
          404: Type.Object({ message: Type.String() })
        },
        tags: ['Tasks']
      }
    },
    async function (request, reply) {
      await tasksRepository.delete(request.params.id)
      reply.code(204)
    }
  )
}

export default plugin
`;

/** https://github.com/hmake98/fastify-typescript — src/routes/user.router.ts */
export const HMAKE_FASTIFY_USER_ROUTER = `
import { FastifyInstance } from 'fastify';
import * as controllers from '../controllers';
import { utils } from '../utils';
import { loginSchema, signupSchema } from '../schemas/User';

async function userRouter(fastify: FastifyInstance) {
  fastify.post(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
      config: {
        description: 'User login endpoint',
      },
      preValidation: utils.preValidation(loginSchema),
    },
    controllers.login,
  );

  fastify.post(
    '/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
          },
        },
      },
      config: {
        description: 'User signup endpoint',
      },
      preValidation: utils.preValidation(signupSchema),
    },
    controllers.signUp,
  );
}

export default userRouter;
`;

/**
 * https://github.com/fastify/fastify — examples/route-prefix.js
 * Same-file register() encapsulation with prefix.
 */
export const FASTIFY_ROUTE_PREFIX_EXAMPLE = `
'use strict'

const fastify = require('../fastify')({ logger: true })

const opts = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          greet: { type: 'string' }
        }
      }
    }
  }
}

fastify.register(function (instance, options, done) {
  instance.get('/hello', opts, (req, reply) => {
    reply.send({ greet: 'hello' })
  })
  done()
}, { prefix: '/english' })

fastify.register(function (instance, options, done) {
  instance.get('/hello', opts, (req, reply) => {
    reply.send({ greet: 'ciao' })
  })
  done()
}, { prefix: '/italian' })

fastify.listen({ port: 8000 }, function (err) {
  if (err) {
    throw err
  }
})
`;

/**
 * https://github.com/fastify/fastify — test/route.3.test.js (trimmed)
 * Full route() declaration with path + method.
 */
export const FASTIFY_ROUTE_OBJECT = `
const Fastify = require('fastify')
const fastify = Fastify()

fastify.route({
  path: '/foo/:an_id',
  method: 'GET',
  schema: {
    params: { an_id: { type: 'number' } }
  },
  handler (req, res) {
    res.send({ hello: 'world' })
  }
})

fastify.route({
  method: ['PUT', 'PATCH'],
  url: '/items/:id',
  handler: updateItem
})
/** https://github.com/quarkusio/quarkus-quickstarts — rest-json-quickstart/src/main/java/org/acme/rest/json/FruitResource.java */
export const QUARKUS_FRUIT_RESOURCE = `
package org.acme.rest.json;

import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;

@Path("/fruits")
public class FruitResource {
    @GET
    public Set<Fruit> list() {
        return null;
    }

    @POST
    public Set<Fruit> add(Fruit fruit) {
        return null;
    }

    @DELETE
    public Set<Fruit> delete(Fruit fruit) {
        return null;
    }
/** https://github.com/kestra-io/kestra — webserver/.../controllers/api/HelloController-shaped MiscController (trimmed) */
export const KESTRA_MISC_CONTROLLER = `
package io.kestra.webserver.controllers.api;

import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;

@Controller("/api/v1")
public class MiscController {
    @Get("/configs")
    public Configuration getConfiguration() {
        return null;
    }

    @Get("/configs/login")
    public LoginConfiguration getLoginConfiguration() {
        return null;
    }

    @Get("/{tenant}/usages/all")
    public ApiUsage getUsages() {
        return null;
    }

    @Post(uri = "/{tenant}/basicAuth")
    public Object createBasicAuth() {
        return null;
    }

    @Post("/login")
    public Object login() {
        return null;
    }
}
`;

/** https://github.com/kestra-io/kestra — webserver/.../controllers/api/ClusterController.java (trimmed) */
export const KESTRA_CLUSTER_CONTROLLER = `
package io.kestra.webserver.controllers.api;

import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.PathVariable;

@Controller("/api/v1/{tenant}/cluster")
public class ClusterController {
    @Get("services/{id}")
    public HttpResponse<?> getService(@PathVariable("id") String id) {
        return HttpResponse.ok();
    }

    @Get("/metrics/{serviceType}")
    public Object metrics() {
        return null;
    }
}
`;

/** https://github.com/kestra-io/kestra — webserver/.../controllers/api/KVController.java (trimmed) */
export const KESTRA_KV_CONTROLLER = `
package io.kestra.webserver.controllers.api;

import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Delete;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Put;

@Controller("/api/v1/{tenant}")
public class KVController {
    @Get("/kv")
    public Object listAllKeys() {
        return null;
    }

    @Get(uri = "/namespaces/{namespace}/kv/{key}")
    public Object getKeyValue() {
        return null;
    }

    @Put(uri = "/namespaces/{namespace}/kv/{key}", consumes = { "text/plain" })
    public void setKeyValue() {}

    @Delete(uri = "/namespaces/{namespace}/kv/{key}")
    public boolean deleteKeyValue() {
        return true;
    }

    @Delete("/namespaces/{namespace}/kv")
    public Object deleteKeyValues() {
        return null;
    }
}
`;

/** https://github.com/asc-lab/micronaut-microservices-poc — policy-service/.../HelloController.java */
export const ASC_LAB_HELLO_CONTROLLER = `
package pl.altkom.asc.lab.micronaut.poc.policy.infrastructure.adapters.web;

import io.micronaut.http.HttpStatus;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import pl.altkom.asc.lab.micronaut.poc.policy.service.api.v1.Health;

@Controller("/hello")
public class HelloController {

    @Get
    public HttpStatus index() {
        return HttpStatus.OK;
    }

    @Get("/version")
    public Health version() {
        return new Health("1.0", "OK");
    }
}
`;

/** https://github.com/asc-lab/micronaut-microservices-poc — agent-portal-gateway/.../OfferGatewayController.java */
export const ASC_LAB_OFFER_GATEWAY_CONTROLLER = `
package pl.altkom.asc.lab.micronaut.poc.gateway;

import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import javax.inject.Inject;

@Controller("/api/offers")
public class OfferGatewayController {

    @Inject
    private Object client;

    @Post(value = "/", consumes = "application/json")
    CreateOfferResult create(CreateOfferCommand cmd) {
        return null;
    }
}
`;

/** https://github.com/com-lihaoyi/mill — example/kotlinlib/web/9-hello-micronaut/micronaut/src/HelloController.kt */
export const MILL_MICRONAUT_HELLO_KT = `
package example.micronaut

import io.micronaut.http.MediaType
import io.micronaut.http.annotation.Controller
import io.micronaut.http.annotation.Get
import io.micronaut.http.annotation.Produces

@Controller("/hello")
class HelloController {
    @Get
    @Produces(MediaType.TEXT_PLAIN)
    fun index(): String = "Hello World"
}
/** https://github.com/koajs/examples — blog/app.js (chained @koa/router verbs) */
export const KOA_EXAMPLES_BLOG_APP = `
const render = require('./lib/render');
const logger = require('koa-logger');
const router = require('@koa/router')();
const koaBody = require('koa-body');

const Koa = require('koa');
const app = module.exports = new Koa();

const posts = [];

app.use(logger());
app.use(render);
app.use(koaBody());

router
  .get('/', list)
  .get('/post/new', add)
  .get('/post/:id', show)
  .post('/post', create);

app.use(router.routes());

async function list(ctx) {
  await ctx.render('list', { posts: posts });
}

async function add(ctx) {
  await ctx.render('new');
}

async function show(ctx) {
  const id = ctx.params.id;
  const post = posts[id];
  if (!post) ctx.throw(404, 'invalid post id');
  await ctx.render('show', { post: post });
}

async function create(ctx) {
  const post = ctx.request.body;
  const id = posts.push(post) - 1;
  post.created_at = new Date();
  post.id = id;
  ctx.redirect('/');
}
`;

/** https://github.com/embbnux/kails — app/routes/users.js (constructor prefix) */
export const KAILS_USERS_ROUTES = `
import Router from '@koa/router';
import users from '../controllers/users';

const router = Router({
  prefix: '/users'
});
router.get('/sign_in', users.signIn);
router.post('/sign_in', users.LogIn);
router.get('/logout', users.LogOut);
router.get('/', users.index);

module.exports = router;
`;

/** https://github.com/embbnux/kails — app/routes/articles.js (prefix + middleware chain) */
export const KAILS_ARTICLES_ROUTES = `
import Router from '@koa/router';
import articles from '../controllers/articles';

const router = Router({
  prefix: '/articles'
});
router.get('/new', articles.checkLogin, articles.newArticle);
router.get('/:id', articles.show);
router.put('/:id', articles.checkLogin, articles.checkArticleOwner, articles.checkParamsBody, articles.update);
router.get('/:id/edit', articles.checkLogin, articles.checkArticleOwner, articles.edit);
router.post('/', articles.checkLogin, articles.checkParamsBody, articles.create);

module.exports = router;
`;

/**
 * Nested mount + constructor prefix (pattern from @koa/router README +
 * https://github.com/javieraviles/node-typescript-koa-rest unprotected/protected split).
 */
export const KOA_NESTED_MOUNT_EXAMPLE = `
import Router from '@koa/router';

const usersRouter = new Router();
usersRouter.get('/', getUsers);
usersRouter.get('/:id', getUser);

const apiRouter = new Router({ prefix: '/api' });
apiRouter.use('/users', usersRouter.routes());

function getUsers(ctx) { ctx.body = []; }
function getUser(ctx) { ctx.body = { id: ctx.params.id }; }
/** https://github.com/slimphp/Slim-Skeleton — app/routes.php */
export const SLIM_SKELETON_ROUTES = `
<?php
declare(strict_types=1);

use App\\Application\\Actions\\User\\ListUsersAction;
use App\\Application\\Actions\\User\\ViewUserAction;
use Psr\\Http\\Message\\ResponseInterface as Response;
use Psr\\Http\\Message\\ServerRequestInterface as Request;
use Slim\\App;
use Slim\\Interfaces\\RouteCollectorProxyInterface as Group;

return function (App $app) {
    $app->options('/{routes:.*}', function (Request $request, Response $response) {
        return $response;
    });

    $app->get('/', function (Request $request, Response $response) {
        $response->getBody()->write('Hello world!');
        return $response;
    });

    $app->group('/users', function (Group $group) {
        $group->get('', ListUsersAction::class);
        $group->get('/{id}', ViewUserAction::class);
    });
};
`;

/** https://github.com/maurobonfietti/rest-api-slim-php — src/App/Routes.php */
export const SLIM_REST_API_ROUTES = `
<?php
declare(strict_types=1);

use App\\Controller\\Note;
use App\\Controller\\Task;
use App\\Controller\\User;
use App\\Middleware\\Auth;

return static function ($app) {
    $app->get('/', 'App\\Controller\\DefaultController:getHelp');
    $app->get('/status', 'App\\Controller\\DefaultController:getStatus');
    $app->post('/login', \\App\\Controller\\User\\Login::class);

    $app->group('/api/v1', function () use ($app): void {
        $app->group('/tasks', function () use ($app): void {
            $app->get('', Task\\GetAll::class);
            $app->post('', Task\\Create::class);
            $app->get('/{id}', Task\\GetOne::class);
            $app->put('/{id}', Task\\Update::class);
            $app->delete('/{id}', Task\\Delete::class);
        })->add(new Auth());

        $app->group('/users', function () use ($app): void {
            $app->get('', User\\GetAll::class)->add(new Auth());
            $app->post('', User\\Create::class);
            $app->get('/{id}', User\\GetOne::class)->add(new Auth());
            $app->put('/{id}', User\\Update::class)->add(new Auth());
            $app->delete('/{id}', User\\Delete::class)->add(new Auth());
        });
    });

    return $app;
};
`;

/** https://github.com/gothinkster/slim-php-realworld-example-app — src/routes.php (trimmed) */
export const SLIM_REALWORLD_ROUTES = `
<?php
use Conduit\\Controllers\\Auth\\LoginController;
use Conduit\\Controllers\\Auth\\RegisterController;
use Conduit\\Controllers\\User\\UserController;
use Slim\\Http\\Request;
use Slim\\Http\\Response;

$app->group('/api',
    function () {
        /** @var \\Slim\\App $this */
        $this->post('/users', RegisterController::class . ':register')->setName('auth.register');
        $this->post('/users/login', LoginController::class . ':login')->setName('auth.login');
        $this->get('/user', UserController::class . ':show')->setName('user.show');
        $this->put('/user', UserController::class . ':update')->setName('user.update');
        $this->map(['GET', 'DELETE', 'PATCH', 'PUT'], '/books/{id:[0-9]+}', function ($request, $response, array $args) {
            return $response;
        });
    });

$app->get('/[{name}]',
    function (Request $request, Response $response, array $args) {
        return $this->renderer->render($response, 'index.phtml', $args);
    });
`;
/** https://github.com/aio-libs/aiohttp-demos — demos/polls/aiohttpdemo_polls/routes.py */
export const AIOHTTP_DEMOS_POLLS_ROUTES = `
import pathlib

from aiohttpdemo_polls.views import index, poll, results, vote

PROJECT_ROOT = pathlib.Path(__file__).parent


def setup_routes(app):
    app.router.add_get("/", index)
    app.router.add_get("/poll/{question_id}", poll, name="poll")
    app.router.add_get("/poll/{question_id}/results", results, name="results")
    app.router.add_post("/poll/{question_id}/vote", vote, name="vote")


def setup_static_routes(app):
    app.router.add_static("/static/", path=PROJECT_ROOT / "static", name="static")
`;

/** https://github.com/aio-libs/aiohttp-demos — demos/blog/aiohttpdemo_blog/routes.py */
export const AIOHTTP_DEMOS_BLOG_ROUTES = `
from aiohttpdemo_blog.views import index, login, logout, create_post


def setup_routes(app):
    app.router.add_get('/', index, name='index')
    app.router.add_get('/login', login, name='login')
    app.router.add_post('/login', login, name='login')
    app.router.add_post('/logout', logout, name='logout')
    app.router.add_get('/create', create_post, name='create-post')
    app.router.add_post('/create', create_post, name='create-post')
`;

/** https://github.com/dani3l0/Status — status.py (trimmed RouteTableDef) */
export const AIOHTTP_STATUS_ROUTETABLE = `
from aiohttp import web

routes = web.RouteTableDef()


@routes.get("/")
async def index(request):
    return web.FileResponse("static/index.html")


@routes.get("/api/status")
async def api(request):
    return web.json_response({})
`;

/** https://github.com/turtlesoupy/this-word-does-not-exist — website/main.py (trimmed add_routes) */
export const AIOHTTP_WORD_ADD_ROUTES = `
from aiohttp import web


def app(handlers=None):
    app = web.Application()
    app.add_routes(
        [
            web.get("/", handlers.index),
            web.get("/api/random_word.json", handlers.random_word_json),
            web.get("/w/{word}/{encrypt}", handlers.word),
            web.get("/shorten_word_url/{word}/{encrypt}", handlers.shorten_word_url),
            web.get("/define_word", handlers.define_word),
            web.get("/favicon.ico", handlers.favicon),
            web.static("/static", "./website/static"),
        ]
    )
    return app
`;

/** Same-file View + add_subapp (pattern from aiohttp docs / Software Heritage-style views). */
export const AIOHTTP_VIEW_AND_SUBAPP = `
from aiohttp import web


class StatsView(web.View):
    async def get(self):
        return web.json_response({"ok": True})

    async def post(self):
        return web.json_response({"created": True})


async def handle_resource(request):
    return web.Response(text="ok")


admin = web.Application()
admin.router.add_get("/resource", handle_resource)
admin.add_routes([web.view("/stats", StatsView)])

app = web.Application()
app.add_subapp("/admin/", admin)
/** https://github.com/howie6879/owllook — owllook/views/api_blueprint.py (trimmed) */
export const OWLLOOK_API_BLUEPRINT = `
from sanic import Blueprint

api_bp = Blueprint('api_blueprint', url_prefix='api')


@api_bp.route("/owl_bd_novels/<name>")
@authenticator('Owllook-Api-Key')
async def owl_bd_novels(request, name):
    return None


@api_bp.route("/owl_novels_chapters", methods=['POST'])
@auth_params('chapters_url', 'novels_name')
@authenticator('Owllook-Api-Key')
async def owl_novels_chapters(request, **kwargs):
    return None


@api_bp.route("/owl_so_novels/<name>")
@authenticator('Owllook-Api-Key')
async def owl_so_novels(request, name):
    return None
`;

/** https://github.com/sanic-org/sanic — examples/blueprints.py (trimmed) */
export const SANIC_OFFICIAL_BLUEPRINTS = `
from sanic import Blueprint, Sanic
from sanic.response import json

app = Sanic("Example")
blueprint = Blueprint("bp_example", url_prefix="/my_blueprint")
blueprint2 = Blueprint("bp_example2", url_prefix="/my_blueprint2")


@blueprint.route("/foo")
async def foo(request):
    return json({"msg": "hi from blueprint"})


@blueprint2.route("/foo")
async def foo2(request):
    return json({"msg": "hi from blueprint2"})


app.blueprint(blueprint)
app.blueprint(blueprint2)
`;

/** https://github.com/sanic-org/sanic — examples/hello_world.py */
export const SANIC_HELLO_WORLD = `
from sanic import Sanic, response

app = Sanic("Example")


@app.route("/")
async def test(request):
    return response.json({"test": True})
`;

/** https://github.com/ahopkins/sanic-jwt — example/on_blueprint.py (trimmed) */
export const SANIC_JWT_ON_BLUEPRINT = `
from sanic import Sanic
from sanic.blueprints import Blueprint
from sanic.response import json
from sanic_jwt.decorators import protected

blueprint = Blueprint("Test")


@blueprint.get("/somewhere", strict_slashes=True)
@protected(blueprint)
def protected_hello_world(request):
    return json({"message": "hello world"})


@blueprint.get("/user/<id>", strict_slashes=True)
@protected(blueprint)
def protected_user(request, id):
    return json({"user": id})


app = Sanic(__name__)
app.blueprint(blueprint, url_prefix="/test")
`;

/** https://github.com/ahopkins/sanic-jwt — example/cbv.py (trimmed) */
export const SANIC_JWT_CBV = `
from sanic import Sanic
from sanic.response import json
from sanic.views import HTTPMethodView

app = Sanic()


class PublicView(HTTPMethodView):
    def get(self, request):
        return json({"hello": "world"})


class ProtectedView(HTTPMethodView):
    async def get(self, request):
        return json({"protected": True})


app.add_route(PublicView.as_view(), "/")
app.add_route(ProtectedView.as_view(), "/protected")
/** https://github.com/jbuget/nodejs-clean-architecture-app — lib/interfaces/routes/users.js */
export const HAPI_CLEAN_ARCH_USERS = `
'use strict';

const UsersController = require('../controllers/UsersController');

module.exports = {
  name: 'users',
  version: '1.0.0',
  register: async (server) => {

    server.route([
      {
        method: 'GET',
        path: '/users',
        handler: UsersController.findUsers,
        options: {
          description: 'List all users',
          tags: ['api'],
        },
      },
      {
        method: 'POST',
        path: '/users',
        handler: UsersController.createUser,
        options: {
          description: 'Create a user',
          tags: ['api'],
        },
      },
      {
        method: 'GET',
        path: '/users/{id}',
        handler: UsersController.getUser,
        options: {
          description: 'Get a user by its {id}',
          tags: ['api'],
        },
      },
      {
        method: 'DELETE',
        path: '/users/{id}',
        handler: UsersController.deleteUser,
        options: {
          description: 'Delete a user',
          tags: ['api'],
        },
      },
    ]);
  }
};
`;

/**
 * https://github.com/jedireza/frame — server/api/login.js (trimmed to two routes)
 * Plugin-style register(server) with options: { … } (handler at top level).
 */
export const HAPI_FRAME_LOGIN = `
'use strict';

const AuthAttempt = require('../models/auth-attempt');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const Session = require('../models/session');
const User = require('../models/user');

const register = function (server, serverOptions) {

    server.route({
        method: 'POST',
        path: '/api/login',
        options: {
            tags: ['api','login'],
            description: 'Log in with username and password. [No Scope]',
            auth: false,
            validate: {
                payload: {
                    username: Joi.string().lowercase().required(),
                    password: Joi.string().required()
                }
            }
        },
        handler: function (request, h) {
            return { ok: true };
        }
    });

    server.route({
        method: 'POST',
        path: '/api/login/forgot',
        options: {
            tags: ['api','login'],
            auth: false
        },
        handler: async function (request, h) {
            return { email: request.payload.email };
        }
    });
};

module.exports = {
    name: 'api-login',
    dependencies: [],
    register
};
`;

/**
 * https://github.com/sparkbox/apprenticeship-sparkjoke — api/routes.js (trimmed)
 * Top-level Hapi.server() + path params + named handler refs.
 */
export const HAPI_SPARKJOKE_ROUTES = `
import Hapi from '@hapi/hapi';

import getJokes from './jokes';
import getUpperBound from '../src/Utilities/upperBound.js';

const init = async () => {
  const server = Hapi.server({
    port: 8081,
    host: 'localhost',
  });

  server.route({
    method: 'GET',
    path: '/welcome',
    handler: () => 'Hello World!',
  });

  server.route({
    method: 'GET',
    path: '/jokes/{jokeIdx}',
    options: {
      cors: {
        origin: ['*'],
      },
    },
    handler: (request) => getJokes(request.params.jokeIdx),
  });

  server.route({
    method: 'GET',
    path: '/jokesUpperBound',
    options: {
      cors: {
        origin: ['*'],
      },
    },
    handler: () => getUpperBound(),
  });

  await server.start();
};

init();
`;

/**
 * Synthetic: method arrays + '*' catch-all + register routes.prefix (same-file).
 * Mirrors https://hapi.dev/api/#server.route() + server.register prefix option.
 */
export const HAPI_METHOD_ARRAY_AND_PREFIX = `
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 3000 });

server.route({
  method: ['PUT', 'POST'],
  path: '/items',
  handler: saveItem,
});

server.route({ method: '*', path: '/{p*}', handler: notFound });

await server.register(function (server, options) {
  server.route({
    method: 'GET',
    path: '/health',
    handler: healthCheck,
  });
}, { routes: { prefix: '/api' } });
/**
 * https://github.com/winstxnhdw/nllb-api — server/api/v4/translator.py
 * Controller.path + empty/@get("/tokens") positional paths.
 */
export const NLLB_TRANSLATOR_CONTROLLER = `
from litestar import Controller, Response, delete, get, post, put

class TranslatorController(Controller):
    path = "/translator"

    @delete(guards=[requires_secret], sync_to_thread=True)
    def unload_model(self, state: AppState) -> Response[None]:
        return Response(content=None)

    @put(guards=[requires_secret], sync_to_thread=True)
    def load_model(self, state: AppState) -> Response[None]:
        return Response(content=None)

    @get("/tokens", cache=True, sync_to_thread=True)
    def tokens(self, state: AppState, text: str) -> Tokens:
        return Tokens(length=0)

    @get(cache=True, sync_to_thread=True)
    def translator_get(self, state: AppState, text: str) -> Translated:
        return Translated(result="")

    @post(status_code=HTTP_200_OK, sync_to_thread=True, deprecated=True)
    def translator_post(self, state: AppState, data: Translation) -> Translated:
        return Translated(result="")

    @get("/stream", sync_to_thread=True)
    def translator_stream(self, state: AppState, text: str) -> ServerSentEvent:
        return ServerSentEvent([])
`;

/**
 * https://github.com/litestar-org/litestar-fullstack — src/py/app/domain/accounts/controllers/_user.py
 * Controller.path + path= kwarg with typed path params.
 */
export const LITESTAR_FULLSTACK_USER_CONTROLLER = `
from litestar import Controller, delete, get, patch, post

class UserController(Controller):
    path = "/api/users"
    tags = ["User Accounts"]

    @get(operation_id="ListUsers")
    async def list_users(self) -> None: ...

    @get(operation_id="GetUser", path="/{user_id:uuid}")
    async def get_user(self, user_id: UUID) -> None: ...

    @post(operation_id="CreateUser")
    async def create_user(self) -> None: ...

    @patch(operation_id="UpdateUser", path="/{user_id:uuid}")
    async def update_user(self, user_id: UUID) -> None: ...

    @delete(operation_id="DeleteUser", path="/{user_id:uuid}")
    async def delete_user(self, user_id: UUID) -> None: ...
`;

/**
 * https://github.com/litestar-org/litestar-fullstack — src/py/app/domain/teams/controllers/_team.py
 * Absolute path= on handlers (no Controller.path).
 */
export const LITESTAR_FULLSTACK_TEAM_CONTROLLER = `
from litestar import Controller, delete, get, patch, post

class TeamController(Controller):
    tags = ["Teams"]

    @get(component="team/list", operation_id="ListTeams", path="/api/teams")
    async def list_teams(self) -> None: ...

    @post(operation_id="CreateTeam", path="/api/teams")
    async def create_team(self) -> None: ...

    @get(operation_id="GetTeam", path="/api/teams/{team_id:uuid}")
    async def get_team(self, team_id: UUID) -> None: ...

    @patch(operation_id="UpdateTeam", path="/api/teams/{team_id:uuid}")
    async def update_team(self, team_id: UUID) -> None: ...

    @delete(operation_id="DeleteTeam", path="/api/teams/{team_id:uuid}")
    async def delete_team(self, team_id: UUID) -> None: ...
`;

/** Synthetic — @route(http_method=…) + Router(path=…) remount via postExtract. */
export const LITESTAR_ROUTE_AND_ROUTER = `
from litestar import HttpMethod, Router, get, route

@route(path="/health", http_method=[HttpMethod.GET, HttpMethod.HEAD])
async def health() -> None: ...

@get("/{order_id:int}")
async def order_handler(order_id: int) -> None: ...

order_router = Router(path="/orders", route_handlers=[order_handler])
/**
 * https://github.com/adonisjs-community/polls-app — start/routes.ts
 * AdonisJS v5 `Route.*` facade with string controller handlers.
 */
export const ADONIS_POLLS_ROUTES = `
import Route from '@ioc:Adonis/Core/Route'

Route.where('id', Route.matchers.number())

Route.get('signup', 'SignupController.create').middleware('guest')
Route.post('signup', 'SignupController.store').middleware('guest')
Route.get('login', 'LoginController.create').middleware('guest')
Route.post('login', 'LoginController.store').middleware('guest')

Route.post('logout', 'LoginController.destroy').middleware('auth')

Route.get('/', 'PollsController.index')

Route.get('/me', 'ProfileController.index').middleware('auth')
Route.post('/me/avatar', 'ProfileController.updateAvatar').middleware('auth')

Route.get('polls/create', 'PollsController.create').middleware('auth')
Route.post('polls', 'PollsController.store').middleware('auth')
Route.get('polls/:slug', 'PollsController.show')
Route.post('polls/:id/vote', 'PollsController.submitVote').middleware('auth')
Route.delete('polls/:id', 'PollsController.destroy').middleware('auth')
`;

/**
 * https://github.com/adocasts/lets-learn-adonisjs-6 — start/routes.ts (trimmed)
 * AdonisJS v6 router service: verb routes, prefixed groups, resource().
 */
export const ADONIS_LEARN_ROUTES = `
import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
const AdminDashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminMoviesController = () => import('#controllers/admin/movies_controller')
const HomeController = () => import('#controllers/home_controller')
const MoviesController = () => import('#controllers/movies_controller')
const RegisterController = () => import('#controllers/auth/register_controller')
const LoginController = () => import('#controllers/auth/login_controller')
const LogoutController = () => import('#controllers/auth/logout_controller')

router.get('/', [HomeController, 'index']).as('home')

router.get('/movies', [MoviesController, 'index']).as('movies.index')

router
  .get('/movies/:slug', [MoviesController, 'show'])
  .as('movies.show')
  .where('slug', router.matchers.slug())

router
  .group(() => {
    router
      .get('/register', [RegisterController, 'show'])
      .as('register.show')
      .use(middleware.guest())

    router
      .post('/register', [RegisterController, 'store'])
      .as('register.store')
      .use(middleware.guest())

    router.get('/login', [LoginController, 'show']).as('login.show').use(middleware.guest())
    router.post('/login', [LoginController, 'store']).as('login.store').use(middleware.guest())

    router.post('/logout', [LogoutController, 'handle']).as('logout').use(middleware.auth())
  })
  .prefix('/auth')
  .as('auth')

router
  .group(() => {
    router.get('/', [AdminDashboardController, 'handle']).as('dashboard')

    router.resource('movies', AdminMoviesController)
  })
  .prefix('/admin')
  .as('admin')
  .use(middleware.admin())
`;

/**
 * https://github.com/adonisjs/adonisjs.com — start/routes.ts (trimmed)
 * resource().params().only() + router.on().render shorthand.
 */
export const ADONIS_SITE_ROUTES = `
import router from '@adonisjs/core/services/router'

const BlogController = () => import('#controllers/blog_controller')
const HomeController = () => import('#controllers/home_controller')

router.get('/', [HomeController])
router.on('/about').render('about')
router.resource('blog', BlogController).params({ blog: 'slug' }).only(['index', 'show'])
`;
