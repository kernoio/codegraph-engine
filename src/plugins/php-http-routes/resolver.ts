/**
 * PHP HTTP route discovery (Kerno in-repo plugin)
 *
 * Covers Laravel `Route::*`, Utopia `Http::` / `App::`, Appwrite Platform
 * `setHttpMethod` + `setHttpPath`, and legacy `$utopia->get()` chains.
 * Replaces stock `laravel` resolver when registered as a built-in plugin.
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

export const FACADE_MAPPINGS: Record<string, string> = {
  Auth: 'Illuminate\\Auth\\AuthManager',
  Cache: 'Illuminate\\Cache\\CacheManager',
  Config: 'Illuminate\\Config\\Repository',
  DB: 'Illuminate\\Database\\DatabaseManager',
  Event: 'Illuminate\\Events\\Dispatcher',
  File: 'Illuminate\\Filesystem\\Filesystem',
  Gate: 'Illuminate\\Auth\\Access\\Gate',
  Hash: 'Illuminate\\Hashing\\HashManager',
  Log: 'Illuminate\\Log\\LogManager',
  Mail: 'Illuminate\\Mail\\Mailer',
  Queue: 'Illuminate\\Queue\\QueueManager',
  Redis: 'Illuminate\\Redis\\RedisManager',
  Request: 'Illuminate\\Http\\Request',
  Response: 'Illuminate\\Http\\Response',
  Route: 'Illuminate\\Routing\\Router',
  Session: 'Illuminate\\Session\\SessionManager',
  Storage: 'Illuminate\\Filesystem\\FilesystemManager',
  URL: 'Illuminate\\Routing\\UrlGenerator',
  Validator: 'Illuminate\\Validation\\Factory',
  View: 'Illuminate\\View\\Factory',
};

const HTTP_VERBS = 'get|post|put|patch|delete|options|head|any';

const UTOPIA_METHOD_MAP: Record<string, string> = {
  HTTP_REQUEST_METHOD_GET: 'GET',
  HTTP_REQUEST_METHOD_POST: 'POST',
  HTTP_REQUEST_METHOD_PUT: 'PUT',
  HTTP_REQUEST_METHOD_PATCH: 'PATCH',
  HTTP_REQUEST_METHOD_DELETE: 'DELETE',
  HTTP_REQUEST_METHOD_OPTIONS: 'OPTIONS',
  HTTP_REQUEST_METHOD_HEAD: 'HEAD',
};

export const phpHttpRoutesResolver: FrameworkResolver = {
  name: 'laravel',
  languages: ['php'],

  detect(context: ResolutionContext): boolean {
    if (context.fileExists('artisan') || context.fileExists('app/Http/Kernel.php')) {
      return true;
    }

    const composer = context.readFile('composer.json');
    if (composer) {
      try {
        const pkg = JSON.parse(composer);
        const deps = { ...(pkg.require ?? {}), ...(pkg['require-dev'] ?? {}) };
        if (
          deps['utopia-php/http'] ||
          deps['utopia-php/framework'] ||
          deps['appwrite/server'] ||
          deps['utopia-php/platform']
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.php')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return (
        new RegExp(`\\b(?:Http|App)::(?:${HTTP_VERBS})\\s*\\(`).test(content) ||
        /->setHttpPath\s*\(\s*['"]/.test(content) ||
        new RegExp(`\\$utopia->(?:${HTTP_VERBS})\\s*\\(`).test(content)
      );
    });
  },

  claimsReference(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*Controller@\w+$/.test(name);
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const modelMatch = ref.referenceName.match(/^([A-Z][a-zA-Z]+)::(\w+)$/);
    if (modelMatch) {
      const [, className, methodName] = modelMatch;
      const result = resolveModelCall(className!, methodName!, context);
      if (result) {
        return {
          original: ref,
          targetNodeId: result,
          confidence: 0.85,
          resolvedBy: 'framework',
        };
      }
    }

    const facadeMatch = ref.referenceName.match(
      /^(Auth|Cache|DB|Log|Mail|Queue|Session|Storage|Validator|Route|Request|Response)::(\w+)$/
    );
    if (facadeMatch) {
      return null;
    }

    if (
      [
        'route',
        'view',
        'config',
        'env',
        'app',
        'abort',
        'redirect',
        'response',
        'request',
        'session',
        'url',
        'asset',
        'mix',
      ].includes(ref.referenceName)
    ) {
      return null;
    }

    const controllerMatch = ref.referenceName.match(/^([A-Z][a-zA-Z]+Controller)@(\w+)$/);
    if (controllerMatch) {
      const [, controller, method] = controllerMatch;
      const result = resolveControllerMethod(controller!, method!, context);
      if (result) {
        return {
          original: ref,
          targetNodeId: result,
          confidence: 0.9,
          resolvedBy: 'framework',
        };
      }
    }

    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (!filePath.endsWith('.php')) return { nodes: [], references: [] };
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];
    const now = Date.now();
    const safe = stripCommentsForRegex(content, 'php');

    extractLaravelRoutes(filePath, safe, now, nodes, references);
    extractUtopiaRoutes(filePath, safe, now, nodes);
    extractPlatformRoutes(filePath, safe, now, nodes);

    return { nodes, references };
  },
};

function extractLaravelRoutes(
  filePath: string,
  safe: string,
  now: number,
  nodes: Node[],
  references: UnresolvedRef[]
): void {
  const routeRegex = new RegExp(
    `Route::(${HTTP_VERBS})\\s*\\(\\s*['"]([^'"]+)['"]\\s*,\\s*([^)]+)\\)`,
    'g'
  );
  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(safe)) !== null) {
    const [, method, routePath, handlerExpr] = match;
    const line = lineAt(safe, match.index);
    const upper = method!.toUpperCase();
    const routeNode = makeRouteNode(filePath, line, upper, routePath!, match[0].length, now);
    nodes.push(routeNode);

    const handlerName = extractLaravelHandler(handlerExpr!);
    if (handlerName) {
      references.push(makeRef(routeNode.id, handlerName, line, filePath));
    }
  }

  const resourceRegex = /Route::(resource|apiResource)\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*([^)]+))?\)/g;
  while ((match = resourceRegex.exec(safe)) !== null) {
    const [, , resourceName, handlerExpr] = match;
    const line = lineAt(safe, match.index);
    const routeNode: Node = {
      id: `route:${filePath}:${line}:RESOURCE:${resourceName}`,
      kind: 'route',
      name: `resource:${resourceName}`,
      qualifiedName: `${filePath}::route:${resourceName}`,
      filePath,
      startLine: line,
      endLine: line,
      startColumn: 0,
      endColumn: match[0].length,
      language: 'php',
      updatedAt: now,
    };
    nodes.push(routeNode);

    if (handlerExpr) {
      const controllerName = extractLaravelHandler(handlerExpr);
      if (controllerName) {
        references.push({
          ...makeRef(routeNode.id, controllerName, line, filePath),
          referenceKind: 'imports',
        });
      }
    }
  }
}

function extractUtopiaRoutes(
  filePath: string,
  safe: string,
  now: number,
  nodes: Node[]
): void {
  const utopiaRegex = new RegExp(
    `\\b(?:Http|App)::(${HTTP_VERBS})\\s*\\(\\s*['"]([^'"]+)['"]`,
    'g'
  );
  let match: RegExpExecArray | null;
  while ((match = utopiaRegex.exec(safe)) !== null) {
    const [, method, routePath] = match;
    const line = lineAt(safe, match.index);
    nodes.push(makeRouteNode(filePath, line, method!.toUpperCase(), routePath!, match[0].length, now));
  }

  const legacyRegex = new RegExp(
    `\\$utopia->(${HTTP_VERBS})\\s*\\(\\s*['"]([^'"]+)['"]`,
    'g'
  );
  while ((match = legacyRegex.exec(safe)) !== null) {
    const [, method, routePath] = match;
    const line = lineAt(safe, match.index);
    nodes.push(makeRouteNode(filePath, line, method!.toUpperCase(), routePath!, match[0].length, now));
  }
}

function extractPlatformRoutes(
  filePath: string,
  safe: string,
  now: number,
  nodes: Node[]
): void {
  const pathRe = /->setHttpPath\s*\(\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pathRe.exec(safe)) !== null) {
    const routePath = match[1]!;
    const line = lineAt(safe, match.index);
    const windowStart = Math.max(0, match.index - 600);
    const before = safe.slice(windowStart, match.index);
    const method = parsePlatformHttpMethod(before) ?? 'GET';
    nodes.push(makeRouteNode(filePath, line, method, routePath, match[0].length, now));
  }
}

function parsePlatformHttpMethod(before: string): string | null {
  const m = before.match(
    /->setHttpMethod\s*\(\s*(?:Action::|[^)]*::)?(HTTP_REQUEST_METHOD_\w+)/
  );
  if (!m) return null;
  return UTOPIA_METHOD_MAP[m[1]!] ?? null;
}

function extractLaravelHandler(expr: string): string | null {
  const trimmed = expr.trim();
  const short = (s: string) => s.split('\\').pop()!;

  const usesMatch = trimmed.match(/['"]uses['"]\s*=>\s*['"]([^'"]+)['"]/);
  if (usesMatch) {
    const full = usesMatch[1]!;
    const at = full.lastIndexOf('@');
    if (at !== -1) {
      return `${short(full.slice(0, at))}@${full.slice(at + 1)}`;
    }
  }

  const tupleMatch = trimmed.match(
    /^\[\s*([A-Za-z_\\][\w\\]*)::class\s*,\s*['"]([^'"]+)['"]\s*\]/
  );
  if (tupleMatch) return `${short(tupleMatch[1]!)}@${tupleMatch[2]!}`;

  const atMatch = trimmed.match(/^['"]([^'"@]+)@([^'"]+)['"]$/);
  if (atMatch) return `${short(atMatch[1]!)}@${atMatch[2]!}`;

  const classMatch = trimmed.match(/^([A-Za-z_\\][\w\\]*)::class/);
  if (classMatch) return short(classMatch[1]!);

  return null;
}

function makeRouteNode(
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  colLen: number,
  now: number
): Node {
  return {
    id: `route:${filePath}:${line}:${method}:${routePath}`,
    kind: 'route',
    name: `${method} ${routePath}`,
    qualifiedName: `${filePath}::route:${routePath}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: colLen,
    language: 'php',
    updatedAt: now,
  };
}

function makeRef(fromNodeId: string, handlerName: string, line: number, filePath: string): UnresolvedRef {
  return {
    fromNodeId,
    referenceName: handlerName,
    referenceKind: 'references',
    line,
    column: 0,
    filePath,
    language: 'php',
  };
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function resolveModelCall(
  className: string,
  methodName: string,
  context: ResolutionContext
): string | null {
  for (const modelPath of [`app/Models/${className}.php`, `app/${className}.php`]) {
    if (!context.fileExists(modelPath)) continue;
    const nodes = context.getNodesInFile(modelPath);
    const methodNode = nodes.find((n) => n.kind === 'method' && n.name === methodName);
    if (methodNode) return methodNode.id;
    const classNode = nodes.find((n) => n.kind === 'class' && n.name === className);
    if (classNode) return classNode.id;
  }
  return null;
}

function resolveControllerMethod(
  controller: string,
  method: string,
  context: ResolutionContext
): string | null {
  const controllerPath = `app/Http/Controllers/${controller}.php`;
  if (context.fileExists(controllerPath)) {
    const nodes = context.getNodesInFile(controllerPath);
    const methodNode = nodes.find((n) => n.kind === 'method' && n.name === method);
    if (methodNode) return methodNode.id;
  }

  for (const ctrl of context.getNodesByName(controller)) {
    if (ctrl.kind === 'class' && ctrl.filePath.includes('Controllers')) {
      const methodNode = context
        .getNodesInFile(ctrl.filePath)
        .find((n) => n.kind === 'method' && n.name === method);
      if (methodNode) return methodNode.id;
    }
  }

  return null;
}
