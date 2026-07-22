/**
 * Kerno in-repo framework plugins (not published to npm).
 *
 * Resolvers here are registered into FRAMEWORK_RESOLVERS at process start so
 * parse workers see the same detectors as the main thread. Lifecycle metadata
 * is also exposed as CodeGraphPlugin objects via getBuiltInPlugins().
 */

import type { CodeGraphPlugin } from '../plugin-system/api';
import type { FrameworkResolver } from '../resolution/types';
import tsoaPlugin, { tsoaResolver } from './tsoa';
import nextAppRouterPlugin, { nextAppRouterResolver } from './next-app-router';
import nestjsKernoPlugin, { nestjsKernoResolver } from './nestjs-kerno';
import goHttpPlugin, { goHttpResolver } from './go-http';
import phpHttpRoutesPlugin, { phpHttpRoutesResolver } from './php-http-routes';
import honoPlugin, { honoResolver } from './hono';

import ktorPlugin, { ktorResolver } from './ktor';


import sinatraGrapePlugin, { sinatraGrapeResolver } from './sinatra-grape';


import symfonyPlugin, { symfonyResolver } from './symfony';


import fastifyPlugin, { fastifyResolver } from './fastify';


import jaxrsPlugin, { jaxrsResolver } from './jaxrs';


import micronautPlugin, { micronautResolver } from './micronaut';


import koaPlugin, { koaResolver } from './koa';


import slimPlugin, { slimResolver } from './slim';


import aiohttpPlugin, { aiohttpResolver } from './aiohttp';


import sanicPlugin, { sanicResolver } from './sanic';


import hapiPlugin, { hapiResolver } from './hapi';


import litestarPlugin, { litestarResolver } from './litestar';


import adonisjsPlugin, { adonisjsResolver } from './adonisjs';


import vertxWebPlugin, { vertxWebResolver } from './vertx-web';


import remixPlugin, { remixResolver } from './remix';


import fastEndpointsPlugin, { fastEndpointsResolver } from './fastendpoints';


import elysiaPlugin, { elysiaResolver } from './elysia';


import http4sPlugin, { http4sResolver } from './http4s';


import tornadoPlugin, { tornadoResolver } from './tornado';


import akkaHttpPlugin, { akkaHttpResolver } from './akka-http';


const BUILTIN_PLUGINS: CodeGraphPlugin[] = [
  tsoaPlugin,
  nextAppRouterPlugin,
  nestjsKernoPlugin,
  goHttpPlugin,
  phpHttpRoutesPlugin,
  honoPlugin,
  ktorPlugin,
  sinatraGrapePlugin,
  symfonyPlugin,
  fastifyPlugin,
  jaxrsPlugin,
  micronautPlugin,
  koaPlugin,
  slimPlugin,
  aiohttpPlugin,
  sanicPlugin,
  hapiPlugin,
  litestarPlugin,
  adonisjsPlugin,
  vertxWebPlugin,
  remixPlugin,
  fastEndpointsPlugin,
  elysiaPlugin,
  http4sPlugin,
  tornadoPlugin,
  akkaHttpPlugin,
];

export function getBuiltInPlugins(): CodeGraphPlugin[] {
  return BUILTIN_PLUGINS;
}

export function getBuiltInPluginResolvers(): FrameworkResolver[] {
  return BUILTIN_PLUGINS.flatMap((p) => p.resolvers ?? []);
}

export {
  tsoaResolver,
  nextAppRouterResolver,
  nestjsKernoResolver,
  goHttpResolver,
  phpHttpRoutesResolver,
  honoResolver,
  ktorResolver,
  sinatraGrapeResolver,
  symfonyResolver,
  fastifyResolver,
  jaxrsResolver,
  micronautResolver,
  koaResolver,
  slimResolver,
  aiohttpResolver,
  sanicResolver,
  hapiResolver,
  litestarResolver,
  adonisjsResolver,
  vertxWebResolver,
  remixResolver,
  fastEndpointsResolver,
  elysiaResolver,
  http4sResolver,
  tornadoResolver,
  akkaHttpResolver,
};
