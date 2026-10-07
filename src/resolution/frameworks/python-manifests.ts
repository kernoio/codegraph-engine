/**
 * Python dependency manifests declared at the repo root and in subfolders
 * (`api/pyproject.toml`, `services/llm-gateway/requirements.txt`). The index
 * lists source files, not manifests — probing directories derived from indexed
 * paths (like `package-deps.ts` for `package.json`) is how monorepo backends
 * get detected.
 */

import type { ResolutionContext } from '../types';

const MANIFEST_NAMES = [
  'requirements.txt',
  'requirements-dev.txt',
  'pyproject.toml',
  'setup.py',
  'Pipfile',
  'setup.cfg',
] as const;

/** Nested manifests read per project, at most — large monorepos are sampled. */
const MAX_MANIFEST_READS = 40;

const cache = new WeakMap<
  ResolutionContext,
  { files: number; dirs: string[] }
>();

/**
 * Directories to probe for manifests: repo root plus the first one or two path
 * segments of every indexed file (e.g. `api/`, `services/llm-gateway/`).
 */
function manifestDirectories(context: ResolutionContext): string[] {
  const files = context.getAllFiles();
  const cached = cache.get(context);
  if (cached && cached.files === files.length) return cached.dirs;

  const dirs = new Set<string>(['']);
  for (const file of files) {
    const norm = file.replace(/\\/g, '/');
    const segs = norm.split('/');
    if (segs.length > 1) dirs.add(`${segs[0]}/`);
    if (segs.length > 2) dirs.add(`${segs[0]}/${segs[1]}/`);
    if (dirs.size > MAX_MANIFEST_READS * 4) break;
  }
  const list = [...dirs];
  cache.set(context, { files: files.length, dirs: list });
  return list;
}

/** True when any probed manifest's text matches `test`. */
export function pythonManifestMatches(
  context: ResolutionContext,
  test: (content: string) => boolean,
): boolean {
  let reads = 0;
  for (const dir of manifestDirectories(context)) {
    for (const name of MANIFEST_NAMES) {
      const rel = dir ? `${dir}${name}` : name;
      const content = context.readFile(rel);
      if (content && test(content)) return true;
      if (++reads >= MAX_MANIFEST_READS) return false;
    }
  }
  return false;
}

/** True when `manage.py` exists at the root or under a probed subfolder. */
export function hasManagePy(context: ResolutionContext): boolean {
  if (context.fileExists('manage.py')) return true;
  for (const dir of manifestDirectories(context)) {
    if (dir && context.fileExists(`${dir}manage.py`)) return true;
  }
  return false;
}
