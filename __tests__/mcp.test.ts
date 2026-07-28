/**
 * MCP server resolver — detects tools/resources/prompts an MCP server exposes, emitted as
 * `kind: 'route'` nodes with the primitive in the verb slot ("TOOL <name>", etc.), mirroring how
 * NestJS message patterns and Spring messaging consumers are surfaced.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { mcpResolver } from '../src/resolution/frameworks/mcp';
import { CodeGraph } from '../src';

describe('mcpResolver.extract — Python (mcp / FastMCP)', () => {
  it('emits a TOOL node named after the decorated function', () => {
    const { nodes } = mcpResolver.extract!(
      'server.py',
      `@mcp.tool()\ndef add(a: int, b: int) -> int:\n    return a + b\n`,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe('route');
    expect(nodes[0]!.name).toBe('TOOL add');
    expect(nodes[0]!.decorators).toEqual(['@mcp.tool']);
  });

  it('prefers an explicit name= over the function name', () => {
    const { nodes } = mcpResolver.extract!(
      'server.py',
      `@mcp.tool(name="do_add", description="adds")\nasync def add(a, b):\n    return a + b\n`,
    );
    expect(nodes[0]!.name).toBe('TOOL do_add');
  });

  it('uses the URI argument for a resource and links the handler', () => {
    const { nodes, references } = mcpResolver.extract!(
      'server.py',
      `@app.resource("config://app")\ndef get_config():\n    return {}\n`,
    );
    expect(nodes[0]!.name).toBe('RESOURCE config://app');
    expect(references[0]!.referenceName).toBe('get_config');
  });

  it('emits a PROMPT node', () => {
    const { nodes } = mcpResolver.extract!(
      'server.py',
      `@srv.prompt()\ndef greeting():\n    return "hi"\n`,
    );
    expect(nodes[0]!.name).toBe('PROMPT greeting');
  });
});

describe('mcpResolver.extract — TypeScript (@modelcontextprotocol/sdk)', () => {
  it('detects server.tool / registerTool / resource by first string argument', () => {
    const { nodes } = mcpResolver.extract!(
      'server.ts',
      `server.tool("echo", "Echoes text", schema, async (args) => ({}));\n` +
        `server.registerTool("add", { description: "adds" }, async (args) => ({}));\n` +
        `server.resource("config", "config://app", async () => ({}));\n`,
    );
    expect(nodes.map((n) => n.name)).toEqual(['TOOL echo', 'TOOL add', 'RESOURCE config']);
    expect(nodes.every((n) => n.kind === 'route' && n.language === 'typescript')).toBe(true);
  });

  it('ignores registrations in test sources (unit-test stubs are not the real surface)', () => {
    const source = `server.tool("echo", "stub", {}, async () => ({}));\n`
    for (const testPath of [
      'ts-sandbox/test/unit/mcp-client.test.ts',
      'src/__tests__/server.ts',
      'server.spec.ts',
      'src/test/kotlin/io/kerno/Foo.kt',
      'tests/test_server.py',
    ]) {
      expect(mcpResolver.extract!(testPath, source).nodes).toEqual([])
    }
  });
});

describe('mcpResolver.extract — Kotlin (constant-referenced names)', () => {
  it('emits a literal tool and a deferred constant-ref, skipping non-constant expressions', () => {
    const { nodes } = mcpResolver.extract!(
      'Registration.kt',
      `fun r() {\n` +
        `  addCheckedTool(name = KernoMcpToolNames.HEALTHCHECK, description = "hc") {}\n` +
        `  registerTool(name = "kerno_literal", description = "l") {}\n` +
        `  registerTool(name = tool.name) {}\n` +
        `}\n`,
    );
    const names = nodes.map((n) => n.name);
    expect(names).toContain('TOOL kerno_literal'); // direct literal
    expect(names).toContain('TOOL HEALTHCHECK'); // deferred placeholder (resolved in postExtract)
    expect(names).not.toContain('TOOL name'); // `tool.name` is not a constant → skipped
    const deferred = nodes.find((n) => n.name === 'TOOL HEALTHCHECK');
    expect(deferred!.signature).toBe('mcp-const:HEALTHCHECK');
  });
});

describe('mcpResolver — end-to-end indexing', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-detect-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('surfaces MCP tools as route nodes in the indexed graph', async () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo-mcp',
        dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'server.ts'),
      `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n` +
        `const server = new McpServer({ name: "demo", version: "1.0.0" });\n` +
        `server.tool("echo", "Echoes text", {}, async (args) => ({ content: [] }));\n` +
        `server.registerTool("add", { description: "adds" }, async (args) => ({ content: [] }));\n`,
    );

    const cg = await CodeGraph.init(dir, { silent: true });
    await cg.indexAll();
    const db = (cg as any).db.db;
    const routes = db
      .prepare(`SELECT name FROM nodes WHERE kind = 'route' ORDER BY name`)
      .all()
      .map((r: any) => r.name);

    expect(routes).toContain('TOOL echo');
    expect(routes).toContain('TOOL add');
    cg.close?.();
  });

  it('resolves constant-referenced tool names across Kotlin files (aicore-style)', async () => {
    // A JVM MCP project: build file declares the SDK; tool names are const references, not literals.
    fs.writeFileSync(
      path.join(dir, 'build.gradle.kts'),
      `dependencies { implementation("io.modelcontextprotocol:kotlin-sdk-server:0.12.0") }\n`,
    );
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'KernoMcpToolNames.kt'),
      `package io.kerno.mcp\n\n` +
        `object KernoMcpToolNames {\n` +
        `    const val HEALTHCHECK: String = "kerno_healthcheck"\n` +
        `    const val LIST_ENDPOINTS: String = "kerno_list_endpoints"\n` +
        `}\n`,
    );
    fs.writeFileSync(
      path.join(src, 'Registration.kt'),
      `package io.kerno.mcp\n\n` +
        `fun register() {\n` +
        `    addCheckedTool(name = KernoMcpToolNames.HEALTHCHECK, description = "hc") {}\n` +
        `    registerTool(name = KernoMcpToolNames.LIST_ENDPOINTS, description = "le") {}\n` +
        `    registerTool(name = "kerno_literal_tool", description = "lit") {}\n` +
        `    registerTool(name = tool.name, description = "dyn") {}\n` +
        `}\n`,
    );

    const cg = await CodeGraph.init(dir, { silent: true });
    await cg.indexAll();
    const db = (cg as any).db.db;
    const routes = db
      .prepare(`SELECT name FROM nodes WHERE kind = 'route' ORDER BY name`)
      .all()
      .map((r: any) => r.name);

    // Constant refs resolved to their literal values via postExtract:
    expect(routes).toContain('TOOL kerno_healthcheck');
    expect(routes).toContain('TOOL kerno_list_endpoints');
    // Direct literal:
    expect(routes).toContain('TOOL kerno_literal_tool');
    // `tool.name` is not statically resolvable → not emitted:
    expect(routes).not.toContain('TOOL name');
    cg.close?.();
  });
});
