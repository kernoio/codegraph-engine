/**
 * Symfony HTTP route discovery (Kerno in-repo plugin)
 *
 * Covers:
 *   - PHP 8 attributes: `#[Route('/path', methods: ['GET'])]` (+ class-level prefix)
 *   - Legacy annotations: `@Route("/path", methods={"GET"})` in docblocks
 *   - YAML route tables (`path:` + `methods:` / `controller:` / `_controller:`)
 *   - XML `<route path="..." methods="..." controller="..."/>`
 *
 * Known gaps (intentionally uncovered — precision over recall):
 *   - Fluent `RoutingConfigurator` / `Routes::config([...])` in config/routes.php
 *   - YAML/XML `resource:` imports that only mount attribute controllers
 *     (those controllers are still found via PHP attribute extraction)
 *   - Cross-file import prefixes (`prefix: /{_locale}` on a resource import)
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
  FrameworkExtractionResult,
} from '../types';

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const symfonyResolver: FrameworkResolver = {
  name: 'symfony',
  languages: ['php', 'yaml', 'xml'],

  detect(context: ResolutionContext): boolean {
    // Laravel apps pull in symfony/routing + http-* — never claim those as Symfony
    // unless framework-bundle / a Symfony kernel is also present.
    const composer = context.readFile('composer.json');
    let deps: Record<string, string> = {};
    if (composer) {
      try {
        const pkg = JSON.parse(composer) as {
          name?: string;
          type?: string;
          require?: Record<string, string>;
          'require-dev'?: Record<string, string>;
        };
        if (typeof pkg.type === 'string' && pkg.type.startsWith('symfony-')) return true;
        deps = { ...(pkg.require ?? {}), ...(pkg['require-dev'] ?? {}) };
        const isLaravel = !!(deps['laravel/framework'] || deps['illuminate/routing']);
        if (deps['symfony/framework-bundle'] || deps['symfony/symfony']) {
          return true;
        }
        if (isLaravel) {
          return false;
        }
        if (
          deps['symfony/routing'] &&
          (deps['symfony/http-kernel'] || deps['symfony/http-foundation']) &&
          (context.fileExists('bin/console') ||
            context.fileExists('src/Kernel.php') ||
            context.fileExists('config/bundles.php'))
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    if (
      context.fileExists('artisan') &&
      !context.fileExists('bin/console') &&
      !context.fileExists('src/Kernel.php')
    ) {
      return false;
    }

    if (
      context.fileExists('bin/console') &&
      (context.fileExists('src/Kernel.php') ||
        context.fileExists('config/bundles.php') ||
        context.fileExists('config/routes.yaml') ||
        context.fileExists('config/routes.yml'))
    ) {
      return true;
    }

    // Content scan: require the Symfony Route import — bare `#[Route` in comments
    // (or non-Symfony attributes) must not trip detection.
    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.php')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return /use\s+Symfony\\Component\\Routing\\(?:Attribute|Annotation)\\Route\b/.test(
        content
      );
    });
  },

  claimsReference(name: string): boolean {
    return (
      name.includes('\\') ||
      /^[A-Za-z_][\w]*Controller::\w+$/.test(name) ||
      /^[A-Za-z_][\w]*::\w+$/.test(name)
    );
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const name = ref.referenceName;

    // App\Controller\BlogController::index  or  BlogController::index
    const methodMatch = name.match(/^(?:.*\\)?([A-Za-z_][\w]*)::(\w+)$/);
    if (methodMatch) {
      const [, className, methodName] = methodMatch;
      const classNodes = context.getNodesByName(className!);
      for (const cls of classNodes) {
        if (cls.kind !== 'class') continue;
        const method = context
          .getNodesInFile(cls.filePath)
          .find((n) => (n.kind === 'method' || n.kind === 'function') && n.name === methodName);
        if (method) {
          return {
            original: ref,
            targetNodeId: method.id,
            confidence: 0.9,
            resolvedBy: 'framework',
          };
        }
        return {
          original: ref,
          targetNodeId: cls.id,
          confidence: 0.7,
          resolvedBy: 'framework',
        };
      }
    }

    // Bare FQCN / short class (invokable controller)
    if (name.includes('\\') && !name.includes(':')) {
      const className = name.split('\\').pop();
      if (className) {
        const cls = context.getNodesByName(className).find((n) => n.kind === 'class');
        if (cls) {
          return {
            original: ref,
            targetNodeId: cls.id,
            confidence: 0.85,
            resolvedBy: 'framework',
          };
        }
      }
    }

    return null;
  },

  extract(filePath, content): FrameworkExtractionResult {
    if (filePath.endsWith('.php')) {
      return extractPhpRoutes(filePath, content);
    }
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      return extractYamlRoutes(filePath, content);
    }
    if (filePath.endsWith('.xml')) {
      return extractXmlRoutes(filePath, content);
    }
    return { nodes: [], references: [] };
  },
};

// ---------------------------------------------------------------------------
// PHP attributes + annotations
// ---------------------------------------------------------------------------

function extractPhpRoutes(filePath: string, content: string): FrameworkExtractionResult {
  if (!content.includes('Route')) return { nodes: [], references: [] };

  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();

  // Keep `#[...]` attributes; blank only // and /* */ so comment examples don't
  // invent routes. (stock stripPhp treats `#` as a comment and would erase attributes.)
  const safe = stripPhpKeepAttributes(content);

  const className = findClassName(safe) ?? findClassName(content);
  const classPrefix = findClassRoutePrefix(safe) || findClassRoutePrefixAnnotation(content);

  // Attributes on methods
  for (const hit of findAttributeRoutes(safe)) {
    if (hit.isClassLevel) continue;
    const path = normalizePath(joinPath(classPrefix, hit.path));
    const methods = hit.methods.length > 0 ? hit.methods : ['GET'];
    const handler = hit.handlerName
      ? className
        ? `${className}::${hit.handlerName}`
        : hit.handlerName
      : null;

    for (const method of methods) {
      const routeNode = makeRouteNode(filePath, hit.line, method, path, hit.length, now, 'php');
      nodes.push(routeNode);
      if (handler) {
        references.push(makeRef(routeNode.id, handler, hit.line, filePath, 'php'));
      }
    }
  }

  // Legacy @Route annotations (live inside docblocks — use original content)
  for (const hit of findAnnotationRoutes(content)) {
    if (hit.isClassLevel) continue;
    const path = normalizePath(joinPath(classPrefix || hit.classPrefix, hit.path));
    const methods = hit.methods.length > 0 ? hit.methods : ['GET'];
    const handler = hit.handlerName
      ? className
        ? `${className}::${hit.handlerName}`
        : hit.handlerName
      : null;

    for (const method of methods) {
      // Avoid double-counting when a file was migrated to attributes but still
      // mentions @Route in docs — skip if we already emitted the same verb+path.
      const name = `${method} ${path}`;
      if (nodes.some((n) => n.name === name && n.startLine === hit.line)) continue;
      const routeNode = makeRouteNode(filePath, hit.line, method, path, hit.length, now, 'php');
      nodes.push(routeNode);
      if (handler) {
        references.push(makeRef(routeNode.id, handler, hit.line, filePath, 'php'));
      }
    }
  }

  return { nodes, references };
}

interface RouteHit {
  path: string;
  methods: string[];
  line: number;
  length: number;
  isClassLevel: boolean;
  handlerName: string | null;
  classPrefix: string;
}

function findAttributeRoutes(safe: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const re = /#\[\s*Route\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const argsStart = m.index + m[0].length;
    const args = readBalanced(safe, argsStart - 1);
    if (args == null) continue;
    const fullEnd = argsStart + args.length; // points at closing )
    // attribute may end with )]
    let end = fullEnd + 1;
    while (end < safe.length && /\s/.test(safe[end]!)) end++;
    if (safe[end] === ']') end++;

    const parsed = parseRouteArgs(args);
    const after = safe.slice(end, end + 1200);
    const isClassLevel = isAttributeClassLevel(after);
    const handlerName = isClassLevel ? null : findFollowingFunctionName(after);

    hits.push({
      path: parsed.path,
      methods: parsed.methods,
      line: lineAt(safe, m.index),
      length: end - m.index,
      isClassLevel,
      handlerName,
      classPrefix: '',
    });
  }
  return hits;
}

function findClassRoutePrefix(safe: string): string {
  for (const hit of findAttributeRoutes(safe)) {
    if (hit.isClassLevel && hit.path) return hit.path;
  }
  return '';
}

function findAnnotationRoutes(content: string): RouteHit[] {
  const hits: RouteHit[] = [];
  // Match @Route(...) only — not Sensio @Route in use-statements without parens.
  const re = /@Route\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // Skip use-imports / non-doc contexts loosely: require a docblock star or
    // whitespace after a preceding `*` on the same/previous lines.
    const before = content.slice(Math.max(0, m.index - 80), m.index);
    if (!/(\*|\/\*\*|^\s*\/\/)/m.test(before) && !before.includes('*')) {
      // Still allow plain ` * @Route` — if there's no * nearby, skip bare code
      // mentions like strings. A use statement `use ...\Route` has no `(`.
      if (!/\*\s*$/.test(before.split('\n').pop() ?? '')) {
        // Heuristic: annotations almost always sit on a docblock line with `*`.
        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        const linePrefix = content.slice(lineStart, m.index);
        if (!linePrefix.includes('*')) continue;
      }
    }

    const argsStart = m.index + m[0].length;
    const args = readBalanced(content, argsStart - 1);
    if (args == null) continue;
    const end = argsStart + args.length + 1;
    const parsed = parseRouteArgs(args);
    const after = content.slice(end, end + 1200);
    const classLevel = isAnnotationClassLevel(after);
    const handlerName = classLevel ? null : findFollowingFunctionName(after);

    hits.push({
      path: parsed.path,
      methods: parsed.methods,
      line: lineAt(content, m.index),
      length: end - m.index,
      isClassLevel: classLevel,
      handlerName,
      classPrefix: '',
    });
  }

  // Attach class prefix from class-level annotation hits
  const classPrefix = hits.find((h) => h.isClassLevel)?.path ?? '';
  for (const h of hits) {
    h.classPrefix = classPrefix;
  }
  return hits;
}

function findClassRoutePrefixAnnotation(content: string): string {
  return findAnnotationRoutes(content).find((h) => h.isClassLevel)?.path ?? '';
}

function isAnnotationClassLevel(after: string): boolean {
  // Walk past remaining docblock + attributes to the next declaration.
  const cleaned = after
    .replace(/^[\s\S]*?\*\//, '') // end of current/remaining docblock
    .trimStart();
  // More stacked annotations?
  const withoutAnnot = cleaned.replace(/^(?:\/\*\*[\s\S]*?\*\/\s*|#[\s\S]*?\]\s*)+/, '');
  return /^(?:(?:final|abstract|readonly)\s+)*class\b/.test(withoutAnnot || cleaned);
}

function findClassName(src: string): string | null {
  const m = src.match(/\b(?:final\s+|abstract\s+|readonly\s+)*class\s+([A-Za-z_][\w]*)/);
  return m?.[1] ?? null;
}

function findFollowingFunctionName(after: string): string | null {
  const m = after.match(/\bfunction\s+&?([A-Za-z_][\w]*)\s*\(/);
  return m?.[1] ?? null;
}

/** True when the next declaration after stacked attributes is a class. */
function isAttributeClassLevel(after: string): boolean {
  let i = 0;
  const n = after.length;
  while (i < n) {
    while (i < n && /\s/.test(after[i]!)) i++;
    if (after.startsWith('#[', i)) {
      const close = findPhpAttributeEnd(after, i);
      if (close < 0) break;
      i = close;
      continue;
    }
    break;
  }
  return /^(?:(?:final|abstract|readonly)\s+)*class\b/.test(after.slice(i));
}

/** Index just past the closing `]` of a `#[...]` attribute starting at `start`. */
function findPhpAttributeEnd(src: string, start: number): number {
  if (!src.startsWith('#[', start)) return -1;
  let i = start + 2;
  let depth = 0;
  let inStr: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    if (inStr) {
      if (c === '\\' && i + 1 < src.length) {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      if (depth === 0 && c === ']') return i + 1;
      depth--;
    }
    i++;
  }
  return -1;
}

function parseRouteArgs(args: string): { path: string; methods: string[] } {
  let path = '';
  const pathNamed =
    args.match(/\bpath\s*:\s*['"]([^'"]*)['"]/) ||
    args.match(/\bpath\s*=\s*['"]([^'"]*)['"]/);
  if (pathNamed) {
    path = pathNamed[1]!;
  } else {
    // First positional string argument
    const positional = args.match(/^\s*['"]([^'"]*)['"]/);
    if (positional) path = positional[1]!;
  }

  const methods = parseMethodsFromArgs(args);
  return { path, methods };
}

function parseMethodsFromArgs(args: string): string[] {
  // methods: ['GET', 'POST']  /  methods={"GET","HEAD"}  /  methods="GET"  /  methods=GET
  const arrayMatch = args.match(/\bmethods\s*[:=]\s*\[([^\]]*)\]/) ||
    args.match(/\bmethods\s*[:=]\s*\{([^}]*)\}/);
  if (arrayMatch) {
    return extractVerbTokens(arrayMatch[1]!);
  }
  const scalar =
    args.match(/\bmethods\s*[:=]\s*['"]([^'"]+)['"]/) ||
    args.match(/\bmethods\s*[:=]\s*([A-Za-z|]+)/);
  if (scalar) {
    return extractVerbTokens(scalar[1]!);
  }
  return [];
}

function extractVerbTokens(raw: string): string[] {
  const found = raw
    .split(/[|,\s]+/)
    .map((s) => s.replace(/['"]/g, '').trim().toUpperCase())
    .filter((s): s is (typeof HTTP_VERBS)[number] =>
      (HTTP_VERBS as readonly string[]).includes(s)
    );
  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

function isSymfonyRouteYamlFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  // config/routes.yaml, config/routes/*.yaml, **/routing.yml, **/routing/*.yml
  // Do NOT scan config/packages/* — monolog etc. also have `path:` keys.
  if (/(^|\/)config\/routes(\/|\.(ya?ml)$)/.test(norm)) return true;
  if (/(^|\/)routing(\/|\.(ya?ml)$)/.test(norm)) return true;
  if (/(^|\/)routes\.(ya?ml)$/.test(norm)) return true;
  return false;
}

function extractYamlRoutes(filePath: string, content: string): FrameworkExtractionResult {
  if (!isSymfonyRouteYamlFile(filePath)) return { nodes: [], references: [] };
  // Only concrete route tables — skip pure resource-import files that never
  // declare a `path:` (attribute controllers cover those endpoints).
  if (!/\bpath\s*:/.test(content)) return { nodes: [], references: [] };

  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();
  const lines = content.split('\n');

  type Pending = {
    name: string;
    line: number;
    path: string | null;
    methods: string[];
    controller: string | null;
    isResourceImport: boolean;
  };

  let pending: Pending | null = null;
  let baseIndent = 0;

  const flush = () => {
    if (!pending || !pending.path || pending.isResourceImport) {
      pending = null;
      return;
    }
    // Symfony HTTP paths always start with `/`. Reject stream/file paths
    // (e.g. monolog's `path: php://stderr`) if a non-route YAML ever slips through.
    const rawPath = pending.path.trim();
    if (!rawPath.startsWith('/')) {
      pending = null;
      return;
    }
    const methods = pending.methods.length > 0 ? pending.methods : ['GET'];
    for (const method of methods) {
      const routePath = normalizePath(rawPath);
      const routeNode = makeRouteNode(
        filePath,
        pending.line,
        method,
        routePath,
        rawPath.length,
        now,
        'yaml'
      );
      nodes.push(routeNode);
      if (pending.controller) {
        references.push(
          makeRef(routeNode.id, normalizeController(pending.controller), pending.line, filePath, 'yaml')
        );
      }
    }
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);
    // Top-level key: route name
    if (indent === 0 && /^[\w.~-]+\s*:\s*$/.test(trimmed)) {
      flush();
      pending = {
        name: trimmed.replace(/:\s*$/, ''),
        line: i + 1,
        path: null,
        methods: [],
        controller: null,
        isResourceImport: false,
      };
      baseIndent = 0;
      continue;
    }

    if (!pending) continue;

    // New top-level ends previous — handled above. Nested keys:
    if (indent > 0) {
      const pathMatch = trimmed.match(/^path:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
      if (pathMatch) {
        pending.path = pathMatch[1]!.trim();
        continue;
      }

      if (/^resource\s*:/.test(trimmed)) {
        pending.isResourceImport = true;
        continue;
      }

      const controllerMatch =
        trimmed.match(/^controller:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/) ||
        trimmed.match(/^_controller:\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
      if (controllerMatch) {
        pending.controller = controllerMatch[1]!.trim();
        continue;
      }

      const methodsBracket = trimmed.match(/^methods:\s*\[([^\]]+)\]/);
      if (methodsBracket) {
        pending.methods = extractVerbTokens(methodsBracket[1]!);
        continue;
      }
      const methodsScalar = trimmed.match(/^methods:\s*['"]?([A-Za-z|,\s]+)['"]?\s*$/);
      if (methodsScalar) {
        pending.methods = extractVerbTokens(methodsScalar[1]!);
        continue;
      }

      // defaults: block — look ahead isn't needed; `_controller` handled when indented under defaults
      void baseIndent;
    }
  }
  flush();

  return { nodes, references };
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function extractXmlRoutes(filePath: string, content: string): FrameworkExtractionResult {
  if (!content.includes('<route') && !content.includes('<routes')) {
    return { nodes: [], references: [] };
  }

  const nodes: Node[] = [];
  const references: UnresolvedRef[] = [];
  const now = Date.now();

  // Self-closing or open tags with attributes
  const re = /<route\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const attrs = m[1]!;
    const path = attr(attrs, 'path');
    if (!path) continue;
    const controller = attr(attrs, 'controller');
    const methodsRaw = attr(attrs, 'methods');
    const methods = methodsRaw ? extractVerbTokens(methodsRaw) : ['GET'];
    const line = lineAt(content, m.index);
    const routePath = normalizePath(ensureLeadingSlash(path));

    for (const method of methods) {
      const routeNode = makeRouteNode(filePath, line, method, routePath, m[0].length, now, 'xml');
      nodes.push(routeNode);
      if (controller) {
        references.push(
          makeRef(routeNode.id, normalizeController(controller), line, filePath, 'xml')
        );
      }
    }
  }

  return { nodes, references };
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRouteNode(
  filePath: string,
  line: number,
  method: string,
  routePath: string,
  colLen: number,
  now: number,
  language: 'php' | 'yaml' | 'xml'
): Node {
  return {
    id: `route:${filePath}:${line}:${method}:${routePath}`,
    kind: 'route',
    name: `${method} ${routePath}`,
    qualifiedName: `${filePath}::route:${method}:${routePath}`,
    filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: colLen,
    language,
    updatedAt: now,
  };
}

function makeRef(
  fromNodeId: string,
  handlerName: string,
  line: number,
  filePath: string,
  language: 'php' | 'yaml' | 'xml'
): UnresolvedRef {
  return {
    fromNodeId,
    referenceName: handlerName,
    referenceKind: 'references',
    line,
    column: 0,
    filePath,
    language,
  };
}

function normalizeController(raw: string): string {
  // service::method → keep last class-ish segment if present
  return raw.trim();
}

function joinPath(prefix: string, sub: string): string {
  const p = (prefix || '').trim();
  const s = (sub || '').trim();
  if (!p && !s) return '/';
  if (!p) return ensureLeadingSlash(s);
  if (!s || s === '/') {
    return ensureLeadingSlash(p.replace(/\/$/, '') || '/');
  }
  const left = p.replace(/\/$/, '');
  const right = s.replace(/^\//, '');
  return ensureLeadingSlash(`${left}/${right}`);
}

function ensureLeadingSlash(p: string): string {
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Normalize `{slug:post}`, `{page<[0-9]+>}`, `{page<\d+>?1}` → `{slug}` / `{page}`. */
function normalizePath(path: string): string {
  return path
    .replace(/\{([A-Za-z_][\w]*)\s*<[^>]*>(\?[^}]*)?\}/g, '{$1}')
    .replace(/\{([A-Za-z_][\w]*)\s*:[^}]+\}/g, '{$1}');
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Read `(...)` contents starting at the opening `(`. Returns inner args or null. */
function readBalanced(src: string, openParenIndex: number): string | null {
  if (src[openParenIndex] !== '(') return null;
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openParenIndex; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      if (c === '\\' && i + 1 < src.length) {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/** Blank // and /* *\/ comments; leave `#` alone so `#[Route]` survives. */
function stripPhpKeepAttributes(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i]!;
    const c2 = src[i + 1] ?? '';

    if (c === '/' && c2 === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      if (i < n) i += 2;
      for (let j = start; j < i; j++) out[j] = src[j] === '\n' ? '\n' : ' ';
      continue;
    }

    if (c === '/' && c2 === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      for (let j = start; j < i; j++) out[j] = ' ';
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          i += 2;
          continue;
        }
        if (src[i] === '\n') break;
        i++;
      }
      if (i < n && src[i] === quote) i++;
      continue;
    }

    i++;
  }

  return out.join('');
}
