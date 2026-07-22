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
`;
