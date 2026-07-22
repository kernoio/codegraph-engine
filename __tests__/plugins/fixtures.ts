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
