/**
 * The proxy's in-process fallback must not refuse to start over a writer lock
 * that names its own PID: in a fresh container the PID namespace recycles the
 * same numbers, so a lock left by a killed predecessor names this process.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeGraph } from '../src';
import { makeFallbackEngine } from '../src/mcp/index';
import { getWriterPidPath } from '../src/mcp/writer-lock';

describe('makeFallbackEngine writer lock', () => {
  let tempDir: string;
  let root: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-fallback-'));
    root = fs.realpathSync(tempDir);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export function a() { return 1; }\n');
    const cg = await CodeGraph.init(root);
    await cg.indexAll();
    cg.close();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeWriterLock = (pid: number): void => {
    fs.writeFileSync(getWriterPidPath(root), JSON.stringify({ pid, mode: 'fallback', startedAt: 1 }) + '\n');
  };

  it('starts over a leftover lock that names this process', () => {
    writeWriterLock(process.pid);

    expect(() => makeFallbackEngine(root).stop()).not.toThrow();
  });

  it('still refuses a lock held by another live process', () => {
    writeWriterLock(process.ppid);

    expect(() => makeFallbackEngine(root)).toThrow(
      `CodeGraph writer lock held by PID ${process.ppid} (fallback mode).`,
    );
  });
});
