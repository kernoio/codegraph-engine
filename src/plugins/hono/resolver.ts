/**
 * Hono Framework Resolver (Kerno in-repo plugin)
 *
 * Detects HTTP routes from Hono apps:
 *   - app.get/post/put/patch/delete/options/all(path, …)
 *   - chained verbs sharing a path (app.get('/x', h).post(h2))
 *   - app.on(METHOD | METHOD[], path | path[], …)
 *   - new Hono().basePath('/api') prefixes (same file)
 *   - app.route('/prefix', sub) mounts (same-file + cross-file via postExtract)
 *
 * Precision over recall: only runs on files that import `hono` / `@hono/*`,
 * skips middleware (`.use`), and ignores non-path receivers (Map/Headers).
 */

import { Node } from '../../types';
import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
} from '../../resolution/types';
import { stripCommentsForRegex } from '../../resolution/strip-comments';

type JsLang = 'typescript' | 'javascript';

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'all'] as const;
const VERB_ALT = HTTP_VERBS.join('|');

/** Receivers that look like Map/Headers/etc., not Hono apps. */
const NOISE_RECEIVERS = new Set([
  'map',
  'headers',
  'params',
  'query',
  'cookies',
  'req',
  'res',
  'request',
  'response',
  'cache',
  'store',
  'db',
  'formData',
  'url',
  'searchParams',
]);

/** Marker in qualifiedName: file::@hono:receiver::route:METHOD:localPath */
export const HONO_RECV_MARKER = '::@hono:';
const ROUTE_QN_RE = /::@hono:([^:]+)::route:([A-Z]+):(.+)$/;

interface MountEdge {
  parent: string;
  prefix: string;
  child: string;
}

interface CrossFileMount {
  prefix: string;
  childFile: string;
}

export const honoResolver: FrameworkResolver = {
  name: 'hono',
  languages: ['typescript', 'javascript'],

  detect(context: ResolutionContext): boolean {
    const packageJson = context.readFile('package.json');
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.hono || Object.keys(deps).some((k) => k.startsWith('@hono/'))) {
          return true;
        }
      } catch {
        // fall through
      }
    }

    for (const file of context.getAllFiles()) {
      if (!/\.(m?[jt]sx?|cjs)$/.test(file)) continue;
      const content = context.readFile(file);
      if (content && isHonoSource(content)) return true;
    }
    return false;
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context.getNodesByName(ref.referenceName);
    if (candidates.length === 0) return null;
    const preferred = candidates.find(
      (n) =>
        (n.kind === 'function' || n.kind === 'method') &&
        (n.filePath.includes('/handlers/') ||
          n.filePath.includes('/routes/') ||
          n.filePath.includes('/controllers/'))
    );
    const target =
      preferred ??
      candidates.find((n) => n.kind === 'function' || n.kind === 'method') ??
      candidates[0]!;
    return {
      original: ref,
      targetNodeId: target.id,
      confidence: preferred ? 0.85 : 0.7,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content) {
    if (!/\.(m?js|tsx?|cjs)$/.test(filePath)) return { nodes: [], references: [] };
    if (!isHonoSource(content)) return { nodes: [], references: [] };

    const lang = detectLanguage(filePath);
    const safe = stripCommentsForRegex(content, lang);
    const now = Date.now();
    const nodes: Node[] = [];
    const references: UnresolvedRef[] = [];

    const basePaths = collectBasePaths(safe);
    const mounts = collectMounts(safe);
    const mountPrefixes = computeVarMountPrefixes(mounts, basePaths);

    type Pending = {
      index: number;
      length: number;
      receiver: string;
      method: string;
      path: string;
      handler: string | null;
    };
    const pending: Pending[] = [];

    // `recv.verb(…)` or chained `.verb(…)` (continuation without receiver).
    const verbRe = new RegExp(
      `(?:\\b([A-Za-z_$][\\w$]*))?\\.(${VERB_ALT})\\s*\\(\\s*(?:(['"\`])([^'"\`]+)\\3)?`,
      'g'
    );
    let vm: RegExpExecArray | null;
    const lastPathByChain = new Map<number, string>();
    const lastRecvByChain = new Map<number, string>();

    while ((vm = verbRe.exec(safe)) !== null) {
      const verb = vm[2]!;
      const pathLit = vm[4] ?? null;
      const chainKey = findChainStart(safe, vm.index);
      // `app\n  .get(` — receiver sits before whitespace when group 1 is empty.
      const receiver =
        vm[1] ||
        lastRecvByChain.get(chainKey) ||
        peekReceiverBefore(safe, vm.index) ||
        '';
      if (!receiver || NOISE_RECEIVERS.has(receiver)) continue;
      lastRecvByChain.set(chainKey, receiver);

      let routePath = pathLit;
      if (!routePath) {
        routePath = lastPathByChain.get(chainKey) ?? null;
      }
      if (!routePath || !isHonoPath(routePath)) continue;
      lastPathByChain.set(chainKey, routePath);

      const openParen = safe.indexOf('(', vm.index);
      const closeParen = openParen >= 0 ? matchDelim(safe, openParen, '(', ')') : -1;
      const args = closeParen > openParen ? safe.slice(openParen + 1, closeParen) : '';
      const handler = extractHandlerName(args);

      pending.push({
        index: vm.index,
        length: (closeParen > 0 ? closeParen + 1 : vm.index + vm[0].length) - vm.index,
        receiver,
        method: verb === 'all' ? 'ALL' : verb.toUpperCase(),
        path: routePath,
        handler,
      });
    }

    // app.on('GET', '/path', h) | app.on(['PUT','DELETE'], '/path', h)
    // app.on('GET', ['/a', '/b'], h)
    const onRe =
      /\b([A-Za-z_$][\w$]*)\.on\s*\(\s*(\[[^\]]*\]|['"`][A-Z]+['"`])\s*,\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g;
    let om: RegExpExecArray | null;
    while ((om = onRe.exec(safe)) !== null) {
      const receiver = om[1]!;
      if (NOISE_RECEIVERS.has(receiver)) continue;
      const methods = parseMethodArg(om[2]!);
      const paths = parsePathArg(om[3]!);
      if (methods.length === 0 || paths.length === 0) continue;

      const openParen = safe.indexOf('(', om.index);
      const closeParen = openParen >= 0 ? matchDelim(safe, openParen, '(', ')') : -1;
      const args = closeParen > openParen ? safe.slice(openParen + 1, closeParen) : '';
      const handler = extractHandlerName(args);
      const length = (closeParen > 0 ? closeParen + 1 : om.index + om[0].length) - om.index;

      for (const method of methods) {
        for (const path of paths) {
          if (!isHonoPath(path)) continue;
          pending.push({
            index: om.index,
            length,
            receiver,
            method,
            path,
            handler,
          });
        }
      }
    }

    for (const p of pending) {
      const localBase = basePaths.get(p.receiver) ?? '';
      const localPath = joinPaths(localBase, p.path);
      const prefixes = mountPrefixes.get(p.receiver) ?? [''];

      for (const mountPrefix of prefixes) {
        const fullPath = joinPaths(mountPrefix, localPath);
        const line = lineAt(safe, p.index);
        const node: Node = {
          id: `route:${filePath}:${line}:${p.method}:${fullPath}:${p.receiver}`,
          kind: 'route',
          name: `${p.method} ${fullPath}`,
          // Local (pre–cross-file-mount) form for idempotent postExtract.
          qualifiedName: `${filePath}${HONO_RECV_MARKER}${p.receiver}::route:${p.method}:${localPath}`,
          filePath,
          startLine: line,
          endLine: line,
          startColumn: 0,
          endColumn: p.length,
          language: lang,
          updatedAt: now,
        };
        nodes.push(node);
        if (p.handler) {
          references.push({
            fromNodeId: node.id,
            referenceName: p.handler,
            referenceKind: 'references',
            line,
            column: 0,
            filePath,
            language: lang,
          });
        }
      }
    }

    return { nodes, references };
  },

  /**
   * Apply cross-file `app.route('/prefix', importedSubApp)` mounts.
   * Same-file mounts are already applied in extract(); this pass only
   * prefixes routes in the imported module's file.
   */
  postExtract(context: ResolutionContext): Node[] {
    const mountsByChildFile = new Map<string, string[]>();

    for (const filePath of context.getAllFiles()) {
      if (!/\.(m?[jt]sx?|cjs)$/.test(filePath)) continue;
      const content = context.readFile(filePath);
      if (!content || !isHonoSource(content)) continue;
      const lang = detectLanguage(filePath);
      const safe = stripCommentsForRegex(content, lang);
      const imports = collectImports(safe, filePath);

      for (const mount of collectCrossFileMounts(safe, imports)) {
        const list = mountsByChildFile.get(mount.childFile) ?? [];
        list.push(mount.prefix);
        mountsByChildFile.set(mount.childFile, list);
      }
    }

    if (mountsByChildFile.size === 0) return [];

    // Fixpoint: if A mounts B and C mounts A, B gets both prefixes composed.
    const filePrefixes = propagateFileMounts(mountsByChildFile);

    const updates: Node[] = [];
    const routes =
      context.iterateNodesByKind?.('route') != null
        ? Array.from(context.iterateNodesByKind!('route'))
        : context.getNodesByKind('route');

    for (const route of routes) {
      const parsed = parseHonoQualifiedName(route.qualifiedName);
      if (!parsed) continue;
      const prefixes = filePrefixes.get(route.filePath);
      if (!prefixes || prefixes.length === 0) continue;

      for (const prefix of prefixes) {
        if (!prefix || prefix === '/') continue;
        const fullPath = joinPaths(prefix, parsed.localPath);
        const newName = `${parsed.method} ${fullPath}`;
        if (newName === route.name) continue;
        updates.push({
          ...route,
          name: newName,
          // Preserve id + qualifiedName (idempotent; edges stay valid).
        });
      }
    }

    return updates;
  },
};

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

function isHonoSource(content: string): boolean {
  return (
    /from\s+['"]hono(?:\/[^'"]*)?['"]/.test(content) ||
    /from\s+['"]@hono\//.test(content) ||
    /require\s*\(\s*['"]hono['"]/.test(content) ||
    /require\s*\(\s*['"]@hono\//.test(content)
  );
}

function isHonoPath(path: string): boolean {
  return path.startsWith('/') || path === '*' || path.startsWith('*');
}

function detectLanguage(filePath: string): JsLang {
  return /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript';
}

function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

// ---------------------------------------------------------------------------
// Path / mount helpers
// ---------------------------------------------------------------------------

function joinPaths(...parts: string[]): string {
  const segs: string[] = [];
  for (const p of parts) {
    if (!p || p === '/') continue;
    for (const seg of p.split('/')) {
      if (!seg) continue;
      segs.push(seg);
    }
  }
  return '/' + segs.join('/');
}

function collectBasePaths(safe: string): Map<string, string> {
  const map = new Map<string, string>();
  // const api = new Hono(…).basePath('/api')
  // const api = new Hono().basePath("/api/v1")
  const re =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Hono\b[^;]*?\.basePath\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    map.set(m[1]!, m[2]!);
  }
  // api = api.basePath('/x') / chained reassignment
  const re2 =
    /\b([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\.basePath\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = re2.exec(safe)) !== null) {
    const existing = map.get(m[1]!);
    map.set(m[1]!, existing ? joinPaths(existing, m[2]!) : m[2]!);
  }
  return map;
}

function collectMounts(safe: string): MountEdge[] {
  const edges: MountEdge[] = [];
  const re =
    /\b([A-Za-z_$][\w$]*)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    edges.push({ parent: m[1]!, prefix: m[2]!, child: m[3]! });
  }
  return edges;
}

/** Absolute mount prefixes (from root) for each child var, same-file. */
function computeVarMountPrefixes(
  mounts: MountEdge[],
  basePaths: Map<string, string>
): Map<string, string[]> {
  const children = new Set(mounts.map((e) => e.child));
  const prefixes = new Map<string, Set<string>>();

  const ensure = (v: string) => {
    if (!prefixes.has(v)) {
      // Roots (never mounted as child) sit at ''.
      prefixes.set(v, new Set(children.has(v) ? [] : ['']));
    }
    return prefixes.get(v)!;
  };

  // Seed every mentioned var.
  for (const e of mounts) {
    ensure(e.parent);
    ensure(e.child);
  }
  for (const v of basePaths.keys()) ensure(v);

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 32) {
    changed = false;
    for (const e of mounts) {
      const parentSet = ensure(e.parent);
      const childSet = ensure(e.child);
      const parentList = parentSet.size > 0 ? [...parentSet] : [''];
      for (const pp of parentList) {
        const full = joinPaths(pp, e.prefix);
        if (!childSet.has(full)) {
          childSet.add(full);
          changed = true;
        }
      }
    }
  }

  // Vars that are only route receivers (never mounted) → [''].
  const out = new Map<string, string[]>();
  for (const [v, set] of prefixes) {
    out.set(v, set.size > 0 ? [...set] : ['']);
  }
  return out;
}

function propagateFileMounts(
  direct: Map<string, string[]>
): Map<string, string[]> {
  // direct: childFile → prefixes from immediate parents' files (one hop).
  // Compose when a file that is itself mounted mounts another.
  const result = new Map<string, Set<string>>();
  for (const [file, prefs] of direct) {
    result.set(file, new Set(prefs));
  }

  // We only have child→prefix edges without parent identity; one hop is what
  // extract+postExtract need for the common `index`→`api` pattern. Nested
  // file A→B→C needs parent file prefixes — approximate by also treating each
  // mounted file's prefixes as composable onto files it mounts, using a second
  // scan is out of scope without parent links. Return direct prefixes.
  const out = new Map<string, string[]>();
  for (const [file, set] of result) {
    out.set(file, [...set]);
  }
  return out;
}

function parseHonoQualifiedName(
  qn: string
): { receiver: string; method: string; localPath: string } | null {
  const m = qn.match(ROUTE_QN_RE);
  if (!m) return null;
  return { receiver: m[1]!, method: m[2]!, localPath: m[3]! };
}

// ---------------------------------------------------------------------------
// Cross-file import → mount
// ---------------------------------------------------------------------------

interface ImportBind {
  localName: string;
  source: string;
  resolvedPath: string;
}

function collectImports(safe: string, fromFile: string): ImportBind[] {
  const out: ImportBind[] = [];
  // import api from './api'
  // import foo, { bar as baz } from './x'
  const re =
    /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const source = m[3]!;
    if (!source.startsWith('.') && !source.startsWith('/')) continue;
    const resolved = resolveRelative(fromFile, source);
    if (m[1]) {
      out.push({ localName: m[1]!, source, resolvedPath: resolved });
    }
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const bit = part.trim();
        if (!bit) continue;
        const alias = bit.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!alias) continue;
        out.push({
          localName: alias[2] ?? alias[1]!,
          source,
          resolvedPath: resolved,
        });
      }
    }
  }
  return out;
}

function collectCrossFileMounts(safe: string, imports: ImportBind[]): CrossFileMount[] {
  const byLocal = new Map(imports.map((i) => [i.localName, i]));
  const out: CrossFileMount[] = [];
  const re =
    /\b[A-Za-z_$][\w$]*\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    const prefix = m[1]!;
    const local = m[2]!;
    const imp = byLocal.get(local);
    if (!imp) continue; // same-file mount — handled in extract()
    out.push({ prefix, childFile: imp.resolvedPath });
  }
  return out;
}

function resolveRelative(fromFile: string, spec: string): string {
  const fromDir = fromFile.includes('/')
    ? fromFile.slice(0, fromFile.lastIndexOf('/'))
    : '';
  const parts = (fromDir ? fromDir.split('/') : []).concat([]);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  let path = parts.join('/');
  // Normalize extension-less imports to .ts (factory-line / typical TS layout).
  if (!/\.[a-z]+$/i.test(path)) {
    path = `${path}.ts`;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Call / arg parsing
// ---------------------------------------------------------------------------

function parseMethodArg(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return [...trimmed.matchAll(/['"`]([A-Z]+)['"`]/g)].map((m) => m[1]!);
  }
  const one = trimmed.match(/^['"`]([A-Z]+)['"`]$/);
  return one ? [one[1]!] : [];
}

function parsePathArg(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return [...trimmed.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!);
  }
  const one = trimmed.match(/^['"`]([^'"`]+)['"`]$/);
  return one ? [one[1]!] : [];
}

function extractHandlerName(args: string): string | null {
  if (!args || args.includes('=>')) return null;
  const parts = splitTopLevelArgs(args);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!.trim();
  // Ident or Qual.ident — skip inline objects / new X
  const m = last.match(/^(?:[A-Za-z_$][\w$]*\.)?([A-Za-z_$][\w$]*)$/);
  if (!m) return null;
  const name = m[1]!;
  if (name === 'async' || name === 'function') return null;
  return name;
}

function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < args.length && args[i] !== q) {
        if (args[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(args.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** For `app\n  .get(`, return `app` when the match starts at `.get`. */
function peekReceiverBefore(safe: string, dotIndex: number): string | null {
  let i = dotIndex - 1;
  while (i >= 0 && /\s/.test(safe[i]!)) i--;
  if (i < 0) return null;
  // End of previous call in a chain: `).post` — not a fresh receiver.
  if (safe[i] === ')') return null;
  if (!/[A-Za-z_$]/.test(safe[i]!)) return null;
  let end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_$]/.test(safe[i]!)) i--;
  const name = safe.slice(i + 1, end);
  return name || null;
}

function findChainStart(safe: string, index: number): number {
  // Walk left over `.method(...)` chain to a stable key (first call's index).
  let i = index;
  while (i > 0) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(safe[j]!)) j--;
    if (j < 0 || safe[j] !== ')') break;
    const open = matchDelimBackward(safe, j, '(', ')');
    if (open < 0) break;
    let k = open - 1;
    while (k >= 0 && /\s/.test(safe[k]!)) k--;
    // … .verb (
    const verbMatch = safe.slice(Math.max(0, k - 32), k + 1).match(/\.(get|post|put|patch|delete|options|all|on)$/);
    if (!verbMatch) break;
    i = Math.max(0, k - verbMatch[0].length + 1);
    // continue walking
    const recvEnd = i - 1;
    let r = recvEnd;
    while (r >= 0 && /[\w$]/.test(safe[r]!)) r--;
    i = r + 1;
  }
  return i;
}

function matchDelim(s: string, open: number, oc: string, cc: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === oc) depth++;
    else if (ch === cc) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchDelimBackward(s: string, close: number, oc: string, cc: string): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i--;
      while (i >= 0 && s[i] !== q) {
        if (i > 0 && s[i - 1] === '\\') i--;
        i--;
      }
      continue;
    }
    if (ch === cc) depth++;
    else if (ch === oc) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
