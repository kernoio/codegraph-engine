# Graphify vs the endpoint factory line

**Date:** 2026-09-30
**Graphify:** PyPI `graphifyy` 0.9.72 (CLI command `graphify`, repo [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) default branch `v8`)
**Corpus:** the 45 mini-repos in [`.har/factory-line/manifest.json`](../../.har/factory-line/manifest.json) (`miniRepos`)
**Oracle:** each case's `expected.json` — the route list [`.har/factory-line/run.mjs`](../../.har/factory-line/run.mjs) asserts after a full CodeGraph index

## Result

Graphify's local AST graph recovered **2 of 206** factory-line endpoints, both inline closures in the Slim case. **0 of 45** cases match the factory line's expected set. The other 204 endpoints never appear as route nodes.

| | |
|---|---|
| Cases | 45 mini-repos, 32 frameworks |
| Expected endpoints | 206 |
| Route-shaped nodes that match an expected endpoint | 2 (`GET /`, `OPTIONS /{routes}`) |
| Cases with full recall | 0 |
| Cases with any true endpoint node | 1 (`slim-skeleton-users`, 2 of 4) |
| Graphify nodes / edges across all cases | 540 / 689 |
| Extraction errors | 0 |

The factory line's job is a composed HTTP endpoint (`GET /api/users/{id}`), including prefixes, groups, mounts, file-based routers, and annotations. Graphify's code extraction builds a symbol graph (files, functions, classes, imports). On these examples those are different results.

## How it was run

For each case, the `files/` tree was copied to a temp directory and extracted with the local AST path only:

```bash
graphify extract <case> --code-only --no-cluster
```

`--code-only` is the complete code extraction. Graphify parses code with tree-sitter on the machine and reserves the model pass for docs, PDFs, and images. These fixtures are source files, so there is no semantic pass left to run. `--no-cluster` keeps the raw graph (community detection does not invent endpoints).

A node counts as an expected endpoint only when its label is an HTTP method plus a path, optionally with a trailing `()`. Parameter spellings are normalized before compare: `:id`, `{id}`, `{id:regex}`, and `<id>` all become `{}`.

A looser check — "does the path string occur inside any label?" — scored 10 of 206. Eight of those are false hits:

- Adonis import specifiers such as `#controllers/admin/movies_controller` contain `/admin/movies`.
- A Next file path `modules/api/v2/health/route.ts` contains `/api/v2/health` and carries no method.

Those are not endpoint nodes. The numbers below use the strict label rule.

## The only hits

`slim-skeleton-users` (`app/routes.php`) registers two inline closures. Graphify named those closures from the call:

| Graphify label | Factory-line endpoint |
|---|---|
| `GET /()` | `GET /` |
| `OPTIONS /{routes:.*}()` | `OPTIONS /{routes}` |

The same file also has the routes the factory line cares about composing, and those are missing:

```php
$app->group('/users', function (Group $group) {
    $group->get('', ListUsersAction::class);      // GET /users
    $group->get('/{id}', ViewUserAction::class);  // GET /users/{id}
});
```

Graphify keeps `ListUsersAction` and `ViewUserAction` as type nodes. It does not join the `/users` group prefix onto the child paths, and a class-string handler is not renamed into a route the way a closure is.

## What the graphs contain instead

Relation mix across all 689 edges: `contains` 237, `references` 153, `imports` 95, `imports_from` 92, `method` 60, `indirect_call` 18, `inherits` 8, `depends_on` 8, `calls` 7, `dynamic_import` 6, plus a handful of `re_exports`, `uses`, and `rationale_for`.

Handler functions are often present. The URL they serve is not.

**Fiber** (`fiber-auth-jwt`, 12 expected routes). The graph has `SetupRoutes()`, `Hello()`, `Login()`, `GetUser()`, `CreateProduct()`, and the rest of the handlers. Paths are built by nested groups (`/api`, then `/auth`, `/users`, `/products`). None of the 12 composed routes is a node. There is 1 `calls` edge in the whole graph.

**NestJS** (`nestjs-global-prefix`, 6 expected routes). Decorator identifiers show up as symbols (`Controller`, `Get`, `Post`) and methods show up as `.login()` / `.logout()`. The path arguments and `setGlobalPrefix('api')` are not applied, so `POST /api/auth/login` is absent. Same pattern on `nestjs-novu-widgets` and `nestjs-uri-version` (0 of 3 and 0 of 3).

**Hono** (`hono-blog`, 7 expected routes). Nodes are `app`, `api`, `middleware`, and model helpers `getPosts()` / `createPost()` / `getPost()`. `app.route('/api', api)` and `api.get('/posts/:id', ...)` do not become endpoints, and there are no `calls` edges at all. `hono-constructor-chain` and `hono-nested-index-mounts` are the same (0 of 6, 0 of 7).

**Django** (`django-users`). Expected route is the literal `users/` from `path('users/', ...)`. The graph is one file node (`urls.py`) and two unresolved import edges (`django.urls`, `users.views`). The path string is not a node. `django-drf-nested` (include + `DefaultRouter`) is 0 of 3.

**Next.js file routes.** `next-health` is a re-export, `export { GET } from "@/modules/api/v2/health/route"`. Graphify emits the file node and one import edge. It does not emit `GET /api/v2/health`. `next-endpoint-scope` does extract a function named `GET()` in `route.ts`, still without the `/api/v2/health` path joined on. `next-signup`, `next-posts`, and `next-pages-api` are 0.

**Adonis** (`adonisjs-learn`, 17 expected routes). Controller bindings are nodes (`AdminMoviesController()`, `#controllers/admin/movies_controller`). `.prefix('/admin')`, `.prefix('/auth')`, and `router.resource('movies', ...)` are not expanded into the 17 method+path endpoints.

**Go mounts** (`gitea-nested-groups` 0/17, `mux-mattermost-prefixes` 0/4, `gin-computed-groups` 0/5). The graph has the router functions (`Routes()`, `NormalRoutes()`). Nested group prefixes such as `/api/v1` are not composed onto the child paths.

Of the 206 expected paths, **139** (excluding the 10 bare `/` routes) do not occur as a single string in the case source. They exist only after a prefix, group, mount, or file-based join — which is what the factory line is for. **57** non-root paths do occur as a literal somewhere in the files (`users/`, `Group("/api")`, `app.route('/api', ...)`, a Next import path, and similar). Copying those literals into the graph still produced **no** strict endpoint match. The two Slim hits are closure names taken from the registration call, not a lookup of the expected path string.

## Per-case score

Strict hits are endpoint labels that match `expected.json`. Node and edge counts are the `--code-only --no-cluster` graph.

| Case | Framework | Expected | Strict hits | Nodes | Edges |
|---|---|---:|---:|---:|---:|
| tsoa-ssh | tsoa | 1 | 0 | 11 | 13 |
| tsoa-get | tsoa | 2 | 0 | 7 | 8 |
| next-health | next-app-router | 1 | 0 | 1 | 1 |
| next-signup | next-app-router | 1 | 0 | 11 | 10 |
| next-posts | next-app-router | 2 | 0 | 11 | 9 |
| next-endpoint-scope | next-app-router | 1 | 0 | 13 | 12 |
| next-pages-api | nextjs | 4 | 0 | 17 | 15 |
| django-users | django | 1 | 0 | 1 | 2 |
| django-drf-nested | django | 3 | 0 | 9 | 16 |
| nestjs-novu-widgets | nestjs | 3 | 0 | 14 | 14 |
| nestjs-global-prefix | nestjs | 6 | 0 | 32 | 37 |
| nestjs-uri-version | nestjs | 3 | 0 | 18 | 19 |
| fiber-auth-jwt | fiber | 12 | 0 | 19 | 32 |
| gitea-nested-groups | go-http | 17 | 0 | 8 | 9 |
| mux-mattermost-prefixes | go-http | 4 | 0 | 16 | 23 |
| gin-computed-groups | go-http | 5 | 0 | 19 | 18 |
| jaxrs-subresource-locators | jaxrs | 5 | 0 | 24 | 46 |
| hono-blog | hono | 7 | 0 | 19 | 23 |
| hono-constructor-chain | hono | 6 | 0 | 17 | 18 |
| hono-nested-index-mounts | hono | 7 | 0 | 12 | 15 |
| ktor-widgets | ktor | 5 | 0 | 4 | 2 |
| sinatra-pizzerias | sinatra | 3 | 0 | 3 | 2 |
| grape-statuses | grape | 6 | 0 | 5 | 4 |
| symfony-blog | symfony | 7 | 0 | 17 | 20 |
| fastify-user-routes | fastify | 4 | 0 | 11 | 15 |
| jaxrs-quarkus-fruits | jaxrs | 3 | 0 | 12 | 22 |
| micronaut-kestra-misc | micronaut | 5 | 0 | 11 | 15 |
| koa-blog-users | koa | 8 | 0 | 22 | 30 |
| slim-skeleton-users | slim | 4 | 2 | 16 | 20 |
| aiohttp-polls | aiohttp | 4 | 0 | 5 | 9 |
| sanic-api | sanic | 3 | 0 | 6 | 9 |
| hapi-users | hapi | 4 | 0 | 15 | 13 |
| litestar-translator | litestar | 6 | 0 | 18 | 25 |
| adonisjs-learn | adonisjs | 17 | 0 | 19 | 33 |
| vertx-simple-rest | vertx-web | 3 | 0 | 10 | 15 |
| remix-healthz | remix | 3 | 0 | 20 | 21 |
| fastendpoints-auth | fastendpoints | 1 | 0 | 15 | 17 |
| elysia-notes | elysia | 5 | 0 | 7 | 6 |
| http4s-todo | http4s | 5 | 0 | 4 | 6 |
| tornado-string-service | tornado | 2 | 0 | 5 | 10 |
| akka-http-users | akka-http | 4 | 0 | 12 | 19 |
| pyramid-benchmarker | pyramid | 3 | 0 | 3 | 4 |
| bottle-crud | bottle | 5 | 0 | 6 | 10 |
| falcon-things | falcon | 1 | 0 | 5 | 6 |
| falcon-asgilook | falcon | 4 | 0 | 10 | 16 |

Expected routes by framework (every row is 0 hits except Slim):

| Framework | Cases | Expected routes | Strict hits |
|---|---:|---:|---:|
| go-http | 3 | 26 | 0 |
| hono | 3 | 20 | 0 |
| adonisjs | 1 | 17 | 0 |
| nestjs | 3 | 12 | 0 |
| fiber | 1 | 12 | 0 |
| jaxrs | 2 | 8 | 0 |
| koa | 1 | 8 | 0 |
| symfony | 1 | 7 | 0 |
| grape | 1 | 6 | 0 |
| litestar | 1 | 6 | 0 |
| next-app-router | 4 | 5 | 0 |
| ktor | 1 | 5 | 0 |
| micronaut | 1 | 5 | 0 |
| elysia | 1 | 5 | 0 |
| http4s | 1 | 5 | 0 |
| bottle | 1 | 5 | 0 |
| falcon | 2 | 5 | 0 |
| nextjs | 1 | 4 | 0 |
| django | 2 | 4 | 0 |
| fastify | 1 | 4 | 0 |
| slim | 1 | 4 | 2 |
| aiohttp | 1 | 4 | 0 |
| hapi | 1 | 4 | 0 |
| akka-http | 1 | 4 | 0 |
| tsoa | 2 | 3 | 0 |
| sinatra | 1 | 3 | 0 |
| sanic | 1 | 3 | 0 |
| vertx-web | 1 | 3 | 0 |
| remix | 1 | 3 | 0 |
| pyramid | 1 | 3 | 0 |
| tornado | 1 | 2 | 0 |
| fastendpoints | 1 | 1 | 0 |

## Scope

The optional cloned-repo phase in the manifest (`FACTORY_LINE_CLONE=1`, Express, Django RealWorld, Fiber boilerplate, and the other `minRoutes` smokes) was not run. Those entries have a minimum route count, not an exact expected list, so they cannot be scored the same way.

CodeGraph was not re-indexed in this environment (`node_modules` and `dist/` were absent). The baseline is the checked-in factory-line oracle, which is the set `run.mjs` fails the build on when a detector regresses.

This comparison is endpoint recall against that oracle. It does not score Graphify as a general symbol graph. On that other job the same runs do record files, callables, and imports; they do not record the composed routes the factory line exists to check.
