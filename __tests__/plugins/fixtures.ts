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
`;