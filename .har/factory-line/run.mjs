#!/usr/bin/env node
/**
 * Factory line — endpoint detection e2e across fixture mini-repos and (optionally)
 * cloned OSS repositories.
 *
 * Usage: node .har/factory-line/run.mjs [--skip-vitest] [--clone-repos]
 *
 * Env:
 *   FACTORY_LINE_ARTIFACTS  — report output dir (default .har/artifacts/factory-line)
 *   FACTORY_LINE_CLONE=1    — same as --clone-repos
 *   FACTORY_LINE_CORPUS     — clone target dir (default .har/artifacts/factory-line/repos)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS = process.env.FACTORY_LINE_ARTIFACTS || path.join(__dirname, '../artifacts/factory-line');
const CORPUS = process.env.FACTORY_LINE_CORPUS || path.join(ARTIFACTS, 'repos');

const args = new Set(process.argv.slice(2));
const skipVitest = args.has('--skip-vitest');
const cloneRepos = args.has('--clone-repos') || process.env.FACTORY_LINE_CLONE === '1';

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDir(from, to);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function runVitestPlugins() {
  log('\n==> Phase 1: in-repo plugin unit tests');
  const r = spawnSync(
    'npx',
    ['vitest', 'run', '__tests__/plugins/'],
    { cwd: REPO_ROOT, stdio: 'inherit', env: process.env }
  );
  if (r.status !== 0) {
    fail('plugin vitest suite failed');
    return false;
  }
  log('✓ plugin tests passed');
  return true;
}

async function loadCodeGraph() {
  const distEntry = path.join(REPO_ROOT, 'dist/index.js');
  if (!fs.existsSync(distEntry)) {
    throw new Error('dist/index.js missing — run npm run build first');
  }
  const mod = await import(pathToFileURL(distEntry).href);
  return mod.CodeGraph ?? mod.default;
}

function routeNodes(cg) {
  return cg.searchNodes('', { kinds: ['route'], limit: 5000 }).map((r) => r.node);
}

function routeNames(cg) {
  return routeNodes(cg)
    .map((n) => n.name)
    .sort();
}

/** Mirrors `isNextHttpRouteHandler` — SCIP-comparable endpoint totals. */
function isHttpHandlerRoute(node) {
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//.test(node.name)) return true;
  return /::route:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS):/.test(node.qualifiedName ?? '');
}

function assertRoutes(caseId, actual, expected, { endpointScope } = {}) {
  const missing = expected.filter((r) => !actual.includes(r));
  const extra = actual.filter((r) => !expected.includes(r));
  if (missing.length) {
    throw new Error(
      `${caseId}: missing routes [${missing.join(', ')}]; got [${actual.join(', ')}]`
    );
  }
  if (extra.length) {
    if (endpointScope === 'http-handler') {
      throw new Error(
        `${caseId}: unexpected routes for endpoint scope [${extra.join(', ')}]; got [${actual.join(', ')}]`
      );
    }
    log(`  note ${caseId}: extra routes [${extra.join(', ')}] (allowed)`);
  }
}

async function runMiniRepoCase(CodeGraph, caseId) {
  const caseRoot = path.join(__dirname, 'cases', caseId);
  const filesDir = path.join(caseRoot, 'files');
  const expected = JSON.parse(fs.readFileSync(path.join(caseRoot, 'expected.json'), 'utf8'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cg-factory-${caseId}-`));

  try {
    copyDir(filesDir, tmp);
    const cg = await CodeGraph.init(tmp, { silent: true });
    await cg.indexAll();
    const nodes = routeNodes(cg);
    const routes =
      expected.endpointScope === 'http-handler'
        ? nodes.filter(isHttpHandlerRoute).map((n) => n.name).sort()
        : nodes.map((n) => n.name).sort();
    assertRoutes(caseId, routes, expected.routes, {
      endpointScope: expected.endpointScope,
    });
    cg.close();
    return { caseId, framework: expected.framework, routes, pass: true };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runMiniRepos(CodeGraph, manifest) {
  log('\n==> Phase 2: mini-repo full-index endpoint detection');
  const results = [];
  for (const caseId of manifest.miniRepos) {
    log(`→ ${caseId}`);
    try {
      const result = await runMiniRepoCase(CodeGraph, caseId);
      log(`  ✓ ${caseId}: ${result.routes.join(', ')}`);
      results.push(result);
    } catch (e) {
      fail(String(e.message || e));
      results.push({ caseId, pass: false, error: String(e.message || e) });
    }
  }
  return results;
}

function cloneOrReuse(url, dest) {
  if (fs.existsSync(path.join(dest, '.git'))) {
    log(`  reusing ${dest}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  log(`  cloning ${url} → ${dest}`);
  execFileSync('git', ['clone', '--depth', '1', url, dest], { stdio: 'inherit' });
}

async function runClonedRepo(CodeGraph, spec) {
  const dest = path.join(CORPUS, spec.id);
  cloneOrReuse(spec.url, dest);
  fs.rmSync(path.join(dest, '.codegraph'), { recursive: true, force: true });

  const cg = await CodeGraph.init(dest, { silent: true });
  await cg.indexAll();
  const routes = routeNames(cg);
  cg.close();

  if (routes.length < (spec.minRoutes ?? 1)) {
    throw new Error(
      `${spec.id}: expected ≥${spec.minRoutes ?? 1} routes, got ${routes.length}`
    );
  }
  return { id: spec.id, routeCount: routes.length, sample: routes.slice(0, 5) };
}

async function runClonedRepos(CodeGraph, manifest) {
  log('\n==> Phase 3: cloned OSS repo smoke (optional)');
  const results = [];
  for (const spec of manifest.repos ?? []) {
    log(`→ ${spec.id}`);
    try {
      const result = await runClonedRepo(CodeGraph, spec);
      log(`  ✓ ${spec.id}: ${result.routeCount} routes (sample: ${result.sample.join(', ')})`);
      results.push({ ...result, pass: true });
    } catch (e) {
      if (spec.optional) {
        log(`  ⚠ ${spec.id} skipped/failed (optional): ${e.message || e}`);
        results.push({ id: spec.id, pass: false, optional: true, error: String(e.message || e) });
      } else {
        fail(String(e.message || e));
        results.push({ id: spec.id, pass: false, error: String(e.message || e) });
      }
    }
  }
  return results;
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  const report = {
    startedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    phases: {},
    pass: true,
  };

  log('==> Building codegraph');
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });

  if (!skipVitest) {
    report.phases.vitest = { pass: runVitestPlugins() };
    if (!report.phases.vitest.pass) report.pass = false;
  }

  const CodeGraph = await loadCodeGraph();
  report.phases.miniRepos = await runMiniRepos(CodeGraph, manifest);
  if (report.phases.miniRepos.some((r) => !r.pass)) report.pass = false;

  if (cloneRepos && (manifest.repos?.length ?? 0) > 0) {
    report.phases.clonedRepos = await runClonedRepos(CodeGraph, manifest);
    const hardFails = report.phases.clonedRepos.filter((r) => !r.pass && !r.optional);
    if (hardFails.length) report.pass = false;
  } else {
    log('\n==> Phase 3 skipped (pass --clone-repos or FACTORY_LINE_CLONE=1 to enable OSS clones)');
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = path.join(ARTIFACTS, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\nReport: ${reportPath}`);

  if (!report.pass) {
    fail('factory line failed — see report.json');
    process.exit(1);
  }
  log('\n✓ factory line passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
