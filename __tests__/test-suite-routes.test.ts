/**
 * Routes declared inside test suites are not endpoints the server serves.
 *
 * n8n's public API fixtures (`__tests__/*.test.ts`) were counted in the
 * endpoint set. A file or directory literally named `test` can still be a
 * real route (`pages/test.tsx`, `app/test/page.tsx`, `src/routes/test.ts`).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodeGraph } from '../src';
import { extractFromSource } from '../src/extraction/tree-sitter';
import { initGrammars, loadAllGrammars } from '../src/extraction/grammars';
import { isTestSuiteFile } from '../src/search/query-utils';

beforeAll(async () => {
  await initGrammars();
  await loadAllGrammars();
});

describe('isTestSuiteFile', () => {
  it('flags the n8n fixture paths and the usual suite conventions', () => {
    const suites = [
      'packages/cli/src/public-api/v1/openapi-gen/__tests__/decorator-routes.test.ts',
      'packages/cli/src/public-api/__tests__/public-api-controller.registry.test.ts',
      'packages/cli/src/__tests__/controller.registry.test.ts',
      'packages/cli/src/public-api/__tests__/public-api-route-resolver.test.ts',
      'packages/cli/src/middlewares/__tests__/content-security-policy.test.ts',
      'packages/cli/src/__tests__/chat-shell.template.test.ts',
      'packages/cli/src/security/__tests__/template-nonce.test.ts',
      'packages/cli/src/utils/__tests__/form-trigger-completion-template.test.ts',
      'src/app.spec.ts',
      'pkg/handler_test.go',
      'users/tests/test_views.py',
      'src/test/java/com/example/UserControllerTest.java',
      'okhttp/src/jvmTest/kotlin/okhttp3/CallTest.kt',
      'spec/requests/users_spec.rb',
    ];
    for (const file of suites) expect(isTestSuiteFile(file), file).toBe(true);
  });

  it('does not flag a production route whose url or module is named test', () => {
    const production = [
      'app/test/page.tsx',
      'pages/test.tsx',
      'pages/api/test.ts',
      'src/routes/test.ts',
      'src/users.controller.ts',
      'src/latest/loader.kt',
      'src/contestEntry.ts',
    ];
    for (const file of production) expect(isTestSuiteFile(file), file).toBe(false);
  });
});

describe('route extraction skips test suites', () => {
  const NEST_CONTROLLER = `
import { Controller, Get, Post } from '@nestjs/common';
@Controller('fixtures')
export class DecoratorRoutesController {
  @Get()
  list() {}
  @Post('items')
  create() {}
}
`;

  it('drops decorator routes from a test file and keeps the same controller in production', () => {
    const fixture = extractFromSource(
      'packages/cli/src/public-api/v1/openapi-gen/__tests__/decorator-routes.test.ts',
      NEST_CONTROLLER,
      'typescript',
      ['nestjs'],
    );
    expect(fixture.nodes.filter((n) => n.kind === 'route')).toEqual([]);
    expect(fixture.unresolvedReferences.filter((r) => r.fromNodeId.startsWith('route:'))).toEqual([]);

    const production = extractFromSource(
      'src/users.controller.ts',
      NEST_CONTROLLER.replace('fixtures', 'users'),
      'typescript',
      ['nestjs'],
    );
    expect(production.nodes.filter((n) => n.kind === 'route').map((n) => n.name).sort()).toEqual([
      'GET /users',
      'POST /users/items',
    ]);
  });

  it('keeps a Next.js page whose directory is named test', () => {
    const page = extractFromSource(
      'app/test/page.tsx',
      'export default function TestPage() { return null }\n',
      'tsx',
      ['nextjs'],
    );
    expect(page.nodes.filter((n) => n.kind === 'route').map((n) => n.name)).toEqual(['/test']);
  });
});

describe('indexed endpoint set', () => {
  let tmpDir: string | undefined;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('does not record routes whose source is a test file', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-suite-routes-'));
    const write = (rel: string, body: string) => {
      const full = path.join(tmpDir!, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    };
    write(
      'package.json',
      JSON.stringify({
        dependencies: { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0', express: '^4.0.0' },
      }),
    );
    write(
      'src/users.controller.ts',
      "import { Controller, Get, Post } from '@nestjs/common';\n" +
        "@Controller('users')\n" +
        'export class UsersController {\n' +
        '  @Get() list() {}\n' +
        '  @Post() create() {}\n' +
        '}\n',
    );
    write(
      'src/routes/test.ts',
      "import express from 'express';\n" +
        'const app = express();\n' +
        "app.get('/from-test-module', (_req, res) => res.send('ok'));\n",
    );
    write(
      'packages/cli/src/public-api/v1/openapi-gen/__tests__/decorator-routes.test.ts',
      "import { Controller, Get, Post } from '@nestjs/common';\n" +
        "@Controller('fixtures')\n" +
        'export class DecoratorRoutesController {\n' +
        '  @Get() list() {}\n' +
        "  @Post('items') create() {}\n" +
        '}\n',
    );
    write(
      'src/server.spec.ts',
      "const app = { get() {} };\n" +
        "app.get('/spec-only', () => {});\n",
    );

    const cg = CodeGraph.initSync(tmpDir);
    await cg.indexAll();
    const routes = cg.getNodesByKind('route');
    const names = routes.map((r) => r.name);
    expect(names).toContain('GET /users');
    expect(names).toContain('POST /users');
    expect(names).toContain('GET /from-test-module');
    expect(names).not.toContain('GET /fixtures');
    expect(names).not.toContain('POST /fixtures/items');
    expect(names).not.toContain('GET /spec-only');
    for (const route of routes) {
      expect(isTestSuiteFile(route.filePath), `${route.name} @ ${route.filePath}`).toBe(false);
    }
    cg.close();
  });
});
