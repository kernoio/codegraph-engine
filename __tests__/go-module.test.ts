import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  discoverGoModules,
  findGoModuleForFile,
  loadGoModule,
} from '../src/resolution/go-module';

describe('go-module multi-module discovery', () => {
  it('findGoModuleForFile walks up to the nearest go.mod', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-go-mod-'));
    fs.writeFileSync(
      path.join(tmp, 'go.mod'),
      'module example.com/root\n',
      'utf-8'
    );
    fs.mkdirSync(path.join(tmp, 'server', 'channels', 'api4'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'server', 'go.mod'),
      'module example.com/server\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(tmp, 'server', 'channels', 'api4', 'user.go'), 'package api4\n');

    expect(loadGoModule(tmp)?.modulePath).toBe('example.com/root');
    expect(findGoModuleForFile(tmp, 'server/channels/api4/user.go')?.modulePath).toBe(
      'example.com/server'
    );
  });

  it('discoverGoModules finds nested modules under the project root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-go-mod-'));
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module example.com/root\n');
    fs.mkdirSync(path.join(tmp, 'server'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'server', 'go.mod'), 'module example.com/server\n');

    const mods = discoverGoModules(tmp).map((m) => m.modulePath).sort();
    expect(mods).toEqual(['example.com/root', 'example.com/server']);
  });
});
