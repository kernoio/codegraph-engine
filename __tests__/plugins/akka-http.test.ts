/**
 * Akka HTTP / Pekko HTTP plugin tests — fixtures from akka/akka-http,
 * arhelmus/akka-http-rest, codegik/pocs (Pekko), theiterators/akka-http-microservice.
 */

import { describe, expect, it } from 'vitest';
import { akkaHttpResolver } from '../../src/plugins/akka-http/resolver';
import {
  AKKA_HTTP_USER_ROUTES,
  AKKA_HTTP_AUTH_ROUTE,
  PEKKO_HTTP_ROUTES,
  AKKA_HTTP_MICROSERVICE_ROUTES,
} from './fixtures';

describe('akka-http plugin (framework: Akka HTTP / Pekko HTTP)', () => {
  it('extracts akka-http quickstart UserRoutes', () => {
    const result = akkaHttpResolver.extract!(
      'src/main/scala/com/example/UserRoutes.scala',
      AKKA_HTTP_USER_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'DELETE /users/{name}',
      'GET /users',
      'GET /users/{name}',
      'POST /users',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'createUser',
      'deleteUser',
      'getUser',
      'getUsers',
    ]);
  });

  it('extracts arhelmus AuthRoute path + ~ alternatives', () => {
    const result = akkaHttpResolver.extract!(
      'src/main/scala/me/archdev/restapi/http/routes/AuthRoute.scala',
      AKKA_HTTP_AUTH_ROUTE
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'POST /auth/signIn',
      'POST /auth/signUp',
    ]);
    expect(result.references.map((r) => r.referenceName).sort()).toEqual([
      'signIn',
      'signUp',
    ]);
  });

  it('extracts Pekko HTTP Scala 3 Routes', () => {
    const result = akkaHttpResolver.extract!(
      'src/main/scala/Routes.scala',
      PEKKO_HTTP_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /health',
      'GET /users/{id}',
      'POST /users',
    ]);
  });

  it('extracts conjunction directives (get & path) from akka-http-microservice', () => {
    const result = akkaHttpResolver.extract!(
      'src/main/scala/AkkaHttpMicroservice.scala',
      AKKA_HTTP_MICROSERVICE_ROUTES
    );
    expect(result.nodes.map((n) => n.name).sort()).toEqual([
      'GET /ip/{ip}',
      'POST /ip',
    ]);
    expect(result.references.map((r) => r.referenceName)).toContain('fetchIpInfo');
  });

  it('detects akka-http via build.sbt dependency', () => {
    const ctx = {
      readFile: (fp: string) =>
        fp === 'build.sbt'
          ? `libraryDependencies += "com.typesafe.akka" %% "akka-http" % "10.7.0"`
          : null,
      fileExists: () => false,
      getAllFiles: () => ['build.sbt'],
      getNodesByName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
      getProjectRoot: () => '/test',
    };
    expect(akkaHttpResolver.detect(ctx as any)).toBe(true);
  });

  it('detects pekko-http via build.sbt dependency', () => {
    const ctx = {
      readFile: (fp: string) =>
        fp === 'build.sbt'
          ? `libraryDependencies += "org.apache.pekko" %% "pekko-http" % "1.1.0"`
          : null,
      fileExists: () => false,
      getAllFiles: () => ['build.sbt'],
      getNodesByName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
      getProjectRoot: () => '/test',
    };
    expect(akkaHttpResolver.detect(ctx as any)).toBe(true);
  });

  it('does not detect unrelated Scala / Play projects', () => {
    const ctx = {
      readFile: (fp: string) => {
        if (fp === 'build.sbt') return `libraryDependencies += "com.typesafe.play" %% "play" % "2.9.0"`;
        if (fp === 'conf/routes') return 'GET / controllers.HomeController.index';
        return null;
      },
      fileExists: (fp: string) => fp === 'conf/routes',
      getAllFiles: () => ['build.sbt', 'conf/routes', 'app/controllers/HomeController.scala'],
      getNodesByName: () => [],
      getNodesByKind: () => [],
      getNodesInFile: () => [],
      getNodesByQualifiedName: () => [],
      getNodesByLowerName: () => [],
      getImportMappings: () => [],
      getProjectRoot: () => '/test',
    };
    expect(akkaHttpResolver.detect(ctx as any)).toBe(false);
  });
});
