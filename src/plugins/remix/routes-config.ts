/**
 * Lightweight parser for React Router framework-mode `app/routes.ts`.
 *
 * Extracts `route` / `index` / `layout` / `prefix` helpers from
 * `@react-router/dev/routes` into `{ urlPath, modulePath }` entries.
 * Dynamic helpers (`flatRoutes()`, `autoRoutes()`, `hydrogenRoutes()`)
 * are intentionally skipped — file-convention extraction covers those.
 */

import { joinRoutePaths, normalizeRoutePath } from './route-path';

export interface RouteConfigEntry {
  /** Absolute URL path (`/api/info`) */
  urlPath: string;
  /** Module path as written in the config (`routes/util/info.ts`) */
  modulePath: string;
}

const CONFIG_SIGNAL =
  /@react-router\/dev\/routes|@remix-run\/(?:dev\/)?routes|@react-router\/fs-routes|flatRoutes\s*\(|autoRoutes\s*\(/;

export function isRoutesConfigFile(filePath: string, content: string): boolean {
  if (!/(^|\/)routes\.(tsx?|jsx?)$/.test(filePath)) return false;
  return CONFIG_SIGNAL.test(content);
}

export function parseRoutesConfig(content: string): RouteConfigEntry[] {
  if (!CONFIG_SIGNAL.test(content) && !/\b(?:route|index|layout|prefix)\s*\(/.test(content)) {
    return [];
  }

  // Narrow to the exported config array when present.
  const exportMatch =
    content.match(/export\s+default\s+(\[[\s\S]*\])\s*(?:satisfies[\s\S]*?)?;/) ||
    content.match(/export\s+const\s+routes\s*(?::\s*[^=]+)?=\s*(\[[\s\S]*\])\s*;/);
  const body = exportMatch?.[1] ?? content;

  const entries: RouteConfigEntry[] = [];
  walkArray(body, '', entries);
  return entries;
}

function walkArray(src: string, prefix: string, out: RouteConfigEntry[]): void {
  let i = 0;
  while (i < src.length) {
    // Skip whitespace / commas
    while (i < src.length && /[\s,]/.test(src[i]!)) i++;
    if (i >= src.length) break;

    // Spread: ...prefix("x", [ ... ]) or ...flatRoutes()
    if (src.startsWith('...', i)) {
      i += 3;
      while (i < src.length && /\s/.test(src[i]!)) i++;
    }

    const call = readCall(src, i);
    if (!call) {
      i++;
      continue;
    }
    i = call.end;

    if (call.name === 'prefix') {
      const pathArg = stringArg(call.args, 0);
      const childArr = arrayArg(call.args);
      if (pathArg != null && childArr != null) {
        walkArray(childArr, joinRoutePaths(prefix, pathArg), out);
      }
      continue;
    }

    if (call.name === 'layout') {
      const childArr = arrayArg(call.args);
      // layout may be layout(file, children) or layout(file, opts, children)
      if (childArr != null) {
        walkArray(childArr, prefix, out);
      }
      continue;
    }

    if (call.name === 'index') {
      const mod = stringArg(call.args, 0);
      if (mod) {
        out.push({ urlPath: normalizeRoutePath(prefix || '/'), modulePath: mod });
      }
      continue;
    }

    if (call.name === 'route') {
      const pathArg = stringArg(call.args, 0);
      const mod = stringArg(call.args, 1);
      if (pathArg != null && mod) {
        const urlPath = joinRoutePaths(prefix, pathArg);
        out.push({ urlPath, modulePath: mod });
        const childArr = arrayArg(call.args);
        if (childArr != null) {
          walkArray(childArr, urlPath, out);
        }
      }
      continue;
    }
  }
}

interface CallExpr {
  name: string;
  args: string;
  end: number;
}

function readCall(src: string, start: number): CallExpr | null {
  const m = src.slice(start).match(/^([A-Za-z_$][\w$]*)\s*\(/);
  if (!m) return null;
  const name = m[1]!;
  const argsStart = start + m[0].length;
  const closed = matchParens(src, argsStart - 1);
  if (closed < 0) return null;
  return {
    name,
    args: src.slice(argsStart, closed),
    end: closed + 1,
  };
}

/** Index of matching `)` for the `(` at `openIdx`. */
function matchParens(src: string, openIdx: number): number {
  let depth = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let escape = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stringArg(args: string, index: number): string | null {
  const parts = splitTopLevelArgs(args);
  const raw = parts[index];
  if (raw == null) return null;
  const m = raw.trim().match(/^(['"])([\s\S]*?)\1/);
  return m ? m[2]! : null;
}

function arrayArg(args: string): string | null {
  const parts = splitTopLevelArgs(args);
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parts[i]!.trim();
    if (t.startsWith('[')) {
      return t.slice(1, -1);
    }
  }
  return null;
}

function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let escape = false;

  for (let i = 0; i < args.length; i++) {
    const ch = args[i]!;
    if (inStr) {
      cur += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace--;
    else if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/**
 * Resolve a routes.ts module path relative to the config file's directory
 * (usually `app/`).
 */
export function resolveRouteModulePath(configFile: string, modulePath: string): string {
  const cleaned = modulePath.replace(/^\.\//, '');
  const dir = configFile.replace(/[/\\][^/\\]+$/, '');
  const joined = dir ? `${dir}/${cleaned}` : cleaned;
  return joined.replace(/\\/g, '/').replace(/\/+/g, '/');
}
