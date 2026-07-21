/**
 * Go module path detection.
 *
 * A Go monorepo's cross-package calls (`pkga.FuncX(...)`) only resolve when
 * the resolver knows the project's module path (the `module ...` directive
 * in `go.mod`). Without it, `isExternalImport` treats every in-module import
 * — `github.com/example/myproject/pkga` — as a third-party package, so
 * resolution falls through to name-matching with path proximity and returns
 * a tiny fraction of the real call sites. See issue #388.
 *
 * Multi-module repos (mattermost server + public, Go workspaces) declare
 * nested `go.mod` files. `findGoModuleForFile` walks upward from a file to
 * the nearest module root so sub-project indexes attribute symbols correctly
 * (issue #7).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GoModule {
  /** The module path declared in `go.mod`, e.g. `github.com/example/myproject` */
  modulePath: string;
  /** Absolute path to the directory containing the `go.mod` file. */
  rootDir: string;
}

/**
 * Read the `go.mod` file at the project root and extract the module path.
 * Returns `null` if no `go.mod` exists or it has no `module` directive.
 */
export function loadGoModule(projectRoot: string): GoModule | null {
  return parseGoModAt(path.join(projectRoot, 'go.mod'), projectRoot);
}

/**
 * Find the Go module that owns `relativeFilePath` by walking up from the file's
 * directory toward `projectRoot`, returning the nearest `go.mod` found.
 */
export function findGoModuleForFile(projectRoot: string, relativeFilePath: string): GoModule | null {
  const absProject = path.resolve(projectRoot);
  let dir = path.dirname(path.resolve(absProject, relativeFilePath));

  while (dir.startsWith(absProject)) {
    const mod = parseGoModAt(path.join(dir, 'go.mod'), dir);
    if (mod) return mod;
    if (dir === absProject) break;
    dir = path.dirname(dir);
  }

  return loadGoModule(projectRoot);
}

/**
 * Discover every `go.mod` under `projectRoot` (bounded depth) for multi-module
 * attribution. Skips `.git`, `node_modules`, and `vendor`.
 */
export function discoverGoModules(projectRoot: string, maxDepth = 6): GoModule[] {
  const absRoot = path.resolve(projectRoot);
  const out: GoModule[] = [];
  const seen = new Set<string>();

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const mod = parseGoModAt(path.join(dir, 'go.mod'), dir);
    if (mod && !seen.has(mod.rootDir)) {
      seen.add(mod.rootDir);
      out.push(mod);
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }

  walk(absRoot, 0);
  return out;
}

function parseGoModAt(goModPath: string, rootDir: string): GoModule | null {
  let content: string;
  try {
    content = fs.readFileSync(goModPath, 'utf-8');
  } catch {
    return null;
  }
  const stripped = content.replace(/\/\/[^\n]*/g, '');
  const match = stripped.match(/^\s*module\s+(\S+)\s*$/m);
  if (!match) return null;
  const modulePath = match[1]!.replace(/^["']|["']$/g, '');
  if (!modulePath) return null;
  return { modulePath, rootDir };
}
