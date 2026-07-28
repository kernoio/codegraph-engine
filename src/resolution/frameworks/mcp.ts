/**
 * Model Context Protocol (MCP) server resolver.
 *
 * Detects the primitives an MCP *server* exposes — tools, resources, prompts — from source, so a
 * codegraph consumer can treat them as endpoints without running the server. Like the other
 * framework resolvers this is regex over comment-stripped source, not AST traversal.
 *
 * There is no dedicated node kind for MCP primitives, so (as NestJS does for @MessagePattern and
 * the Spring messaging listeners do for consumers) each is emitted as a `kind: 'route'` node whose
 * name carries the primitive in the verb slot: `"TOOL <name>"`, `"RESOURCE <name>"`,
 * `"PROMPT <name>"`. A consumer that splits the name on the first space recovers (verb, name).
 *
 * Coverage is the literal-registration cases, which is all static analysis can recover:
 *   - Python (mcp / FastMCP): `@mcp.tool()`, `@server.resource("uri")`, `@app.prompt()` decorators;
 *     the tool name is the `name=`/first-string argument when present, else the decorated function.
 *   - TypeScript/JavaScript (@modelcontextprotocol/sdk): `server.tool("name", ...)`,
 *     `server.registerTool("name", ...)`, and the `resource`/`prompt` equivalents; the name is the
 *     first string argument.
 * Servers that register tools dynamically (names computed at runtime) can only be recovered by
 * live `tools/list` introspection, not here.
 */

import { Node } from '../../types';
import { FrameworkResolver, UnresolvedRef, FrameworkExtractionResult, ResolutionContext } from '../types';
import { stripCommentsForRegex } from '../strip-comments';

type McpPrimitive = 'TOOL' | 'RESOURCE' | 'PROMPT';

// Marker stored in a route node's `signature` when its name is a constant reference that can only be
// resolved cross-file (in postExtract) to the constant's literal value. Format: `mcp-const:<NAME>`.
const CONST_MARKER = 'mcp-const:';

// Test sources register tools that aren't the server's real surface (e.g. a stub `server.tool("echo")`
// in a unit test). Exclude them so detection reports only production registrations — mirroring how the
// rest of analysis skips test directories.
function isTestPath(filePath: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures)\//.test(filePath) ||
    /\/src\/(test|testFixtures|integrationTest)\//.test(filePath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) ||
    /Test\.kts?$/.test(filePath) ||
    /(^|\/)(test_[^/]*|conftest)\.py$/.test(filePath) ||
    /_test\.py$/.test(filePath)
  );
}

const PRIMITIVE_VERB: Record<string, McpPrimitive> = {
  tool: 'TOOL',
  registertool: 'TOOL',
  resource: 'RESOURCE',
  registerresource: 'RESOURCE',
  prompt: 'PROMPT',
  registerprompt: 'PROMPT',
};

function kwargString(args: string, key: string): string | undefined {
  const m = args.match(new RegExp(`\\b${key}\\s*=\\s*['"]([^'"]+)['"]`));
  return m ? m[1] : undefined;
}

function firstStringLiteral(args: string): string | undefined {
  const m = args.match(/['"]([^'"]+)['"]/);
  return m ? m[1] : undefined;
}

function extractPythonMcp(filePath: string, content: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  // @<receiver>.(tool|resource|prompt)( optional args ) decorating the next def.
  const re = /@(\w+)\.(tool|resource|prompt)\b\s*(?:\(([^)]*)\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const verb = PRIMITIVE_VERB[m[2]!.toLowerCase()]!;
    const args = m[3] ?? '';
    const line = content.slice(0, m.index).split('\n').length;

    const tail = content.slice(m.index + m[0].length);
    const defMatch = tail.match(/\n\s*(?:async\s+)?def\s+(\w+)/);
    const handlerName = defMatch ? defMatch[1] : undefined;

    // Name precedence: explicit name= kwarg, then a resource URI (first string arg for a
    // resource, which is positional), then the decorated function's name.
    const explicitName =
      kwargString(args, 'name') ?? (verb === 'RESOURCE' ? firstStringLiteral(args) : undefined);
    const toolName = explicitName ?? handlerName;
    if (!toolName) continue;

    const node: Node = {
      id: `mcp:${filePath}:${line}:${verb}:${toolName}`,
      kind: 'route',
      name: `${verb} ${toolName}`,
      qualifiedName: `${filePath}::${verb}:${toolName}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: m[0].length,
      language: 'python',
      decorators: [`@${m[1]}.${m[2]}`],
      updatedAt: now,
    };
    nodes.push(node);

    if (handlerName) {
      references.push({
        fromNodeId: node.id,
        referenceName: handlerName,
        referenceKind: 'references',
        line,
        column: 0,
        filePath,
        language: 'python',
      });
    }
  }
  return { nodes, references };
}

function extractTsMcp(
  filePath: string,
  content: string,
  language: 'typescript' | 'javascript',
): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const now = Date.now();
  // <receiver>.(tool|registerTool|resource|registerResource|prompt|registerPrompt)("name", ...)
  const re =
    /\b(\w+)\.(registerTool|tool|registerResource|resource|registerPrompt|prompt)\s*\(\s*(['"`])([^'"`]+)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const verb = PRIMITIVE_VERB[m[2]!.toLowerCase()]!;
    const toolName = m[4]!;
    const line = content.slice(0, m.index).split('\n').length;
    nodes.push({
      id: `mcp:${filePath}:${line}:${verb}:${toolName}`,
      kind: 'route',
      name: `${verb} ${toolName}`,
      qualifiedName: `${filePath}::${verb}:${toolName}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: m[0].length,
      language,
      signature: `${m[1]}.${m[2]}("${toolName}")`,
      updatedAt: now,
    });
  }
  return { nodes, references: [] };
}

/**
 * Kotlin/JVM MCP registration. Unlike Python/TS, JVM servers frequently register a tool with the
 * name passed as a *constant reference* (e.g. `registerTool(name = KernoMcpToolNames.HEALTHCHECK)`
 * or a thin wrapper `addCheckedTool(name = …)`), not a string literal. We emit a route node per
 * registration; when the name is a literal we use it directly, and when it's an UPPER_SNAKE constant
 * reference we defer to [resolveKotlinConstants] (postExtract), which reads the `const val` literal
 * cross-file. Non-constant expressions (e.g. `tool.name`) are unresolvable statically and skipped.
 */
function extractKotlinMcp(filePath: string, content: string): FrameworkExtractionResult {
  const nodes: Node[] = [];
  const now = Date.now();
  const re = /\b(addCheckedTool|registerTool)\s*\(\s*name\s*=\s*([^,\n)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const rawExpr = m[2]!.trim();
    const line = content.slice(0, m.index).split('\n').length;

    let literalName: string | null = null;
    let constName: string | null = null;
    const lit = rawExpr.match(/^["']([^"']+)["']$/);
    if (lit) {
      literalName = lit[1]!;
    } else {
      // Last identifier segment of e.g. `KernoMcpToolNames.HEALTHCHECK` or a bare `HEALTHCHECK`.
      const seg = rawExpr.split('.').pop()!.trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(seg)) constName = seg;
      else continue; // variable such as `tool.name` — not statically resolvable
    }

    const nameToken = literalName ?? constName!;
    nodes.push({
      id: `mcp:${filePath}:${line}:TOOL:${nameToken}`,
      kind: 'route',
      name: `TOOL ${nameToken}`,
      qualifiedName: `${filePath}::TOOL:${nameToken}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: m[0].length,
      language: 'kotlin',
      // Constant refs carry a marker so postExtract can substitute the resolved literal.
      signature: constName ? `${CONST_MARKER}${constName}` : undefined,
      updatedAt: now,
    });
  }
  return { nodes, references: [] };
}

/**
 * Cross-file pass: read every `const val X = "literal"` in the project's Kotlin sources, then rewrite
 * any MCP route node whose name is still a deferred constant reference to the resolved literal.
 */
function resolveKotlinConstants(context: ResolutionContext): Node[] {
  const constants = new Map<string, string>();
  for (const file of context.getAllFiles()) {
    if (!file.endsWith('.kt')) continue;
    const content = context.readFile(file);
    if (!content) continue;
    const safe = stripCommentsForRegex(content, 'java');
    const cre = /\bconst\s+val\s+(\w+)\s*(?::\s*[\w.<>?]+)?\s*=\s*"([^"]+)"/g;
    let cm: RegExpExecArray | null;
    while ((cm = cre.exec(safe)) !== null) constants.set(cm[1]!, cm[2]!);
  }

  const updates: Node[] = [];
  for (const node of context.getNodesByKind('route')) {
    const sig = node.signature;
    if (!sig || !sig.startsWith(CONST_MARKER)) continue;
    const value = constants.get(sig.slice(CONST_MARKER.length));
    if (!value) continue; // leave the fallback (constant simple-name) if unresolved
    node.name = `TOOL ${value}`;
    node.qualifiedName = `${node.filePath}::TOOL:${value}`;
    node.signature = undefined;
    updates.push(node);
  }
  return updates;
}

// Gradle/Maven files that may declare a JVM MCP SDK dependency. Checked at both the project root and
// one level down, since JVM projects often nest the build under a module dir (e.g. aicore's `agent/`).
const JVM_BUILD_FILES = [
  'gradle/libs.versions.toml',
  'build.gradle.kts',
  'build.gradle',
  'settings.gradle.kts',
  'settings.gradle',
  'pom.xml',
  'agent/gradle/libs.versions.toml',
  'agent/build.gradle.kts',
];

const JVM_MCP_DEP = /modelcontextprotocol|tachyonmcp|kotlin-sdk-(server|client)|\bmcp-kotlin/i;

export const mcpResolver: FrameworkResolver = {
  name: 'mcp',
  languages: ['python', 'javascript', 'typescript', 'kotlin'],

  detect(context) {
    const requirements = context.readFile('requirements.txt');
    if (requirements && /\b(mcp|fastmcp|modelcontextprotocol)\b/i.test(requirements)) return true;
    const pyproject = context.readFile('pyproject.toml');
    if (pyproject && /\b(mcp|fastmcp|modelcontextprotocol)\b/i.test(pyproject)) return true;
    const packageJson = context.readFile('package.json');
    if (packageJson && packageJson.includes('@modelcontextprotocol/sdk')) return true;
    for (const buildFile of JVM_BUILD_FILES) {
      const content = context.readFile(buildFile);
      if (content && JVM_MCP_DEP.test(content)) return true;
    }
    return false;
  },

  resolve() {
    return null;
  },

  extract(filePath, content) {
    if (isTestPath(filePath)) return { nodes: [], references: [] };
    if (filePath.endsWith('.py')) {
      return extractPythonMcp(filePath, stripCommentsForRegex(content, 'python'));
    }
    if (/\.(ts|tsx|mts|cts)$/.test(filePath)) {
      return extractTsMcp(filePath, stripCommentsForRegex(content, 'javascript'), 'typescript');
    }
    if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) {
      return extractTsMcp(filePath, stripCommentsForRegex(content, 'javascript'), 'javascript');
    }
    if (filePath.endsWith('.kt')) {
      return extractKotlinMcp(filePath, stripCommentsForRegex(content, 'java'));
    }
    return { nodes: [], references: [] };
  },

  postExtract(context) {
    return resolveKotlinConstants(context);
  },
};
