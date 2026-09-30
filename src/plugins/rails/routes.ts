/**
 * Rails `config/routes.rb` reader.
 *
 * Mirrors ActionDispatch::Routing::Mapper enough to keep method + path honest:
 *   - `only:` / `except:` as `%i[]` / `%w[]` / `%i()` / `[:sym]` / a single symbol
 *   - `path:` on `resources` / `resource` / `scope` / `namespace` (literal or a
 *     local bound to a literal list)
 *   - `scope` / `namespace` / nested `resources` prefixes, including
 *     `member` / `collection` / bare routes inside a resource block
 *   - `#{name}` and a bare loop variable, when `name` is bound to a literal
 *     `%w` / `%i` / array in this file
 *
 * A path that still contains `#{...}` or a prefix we cannot read is omitted.
 * A guessed path is worse than a missing one (BE-3279).
 *
 * Known gaps (left out on purpose):
 *   - `draw :name` prefixes declared in the parent file (the drawn file is
 *     read on its own)
 *   - `devise_for`, `mount`, `via: :all`, `concern` / `shallow: true`
 *   - `namespace` opened *inside* a `resources` block (Rails inserts the
 *     nested `:singular_id` segment before that namespace)
 */

import { Node } from '../../types';
import { UnresolvedRef } from '../../resolution/types';

const ROUTE_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'match', 'root',
  'namespace', 'scope', 'resources', 'resource', 'collection', 'member', 'new',
  'controller', 'constraints',
]);

const END_OPEN = new Set([
  'if', 'unless', 'while', 'until', 'begin', 'case', 'for', 'class', 'module', 'def',
]);

const VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

const PLURAL_ACTIONS = ['index', 'create', 'new', 'show', 'edit', 'update', 'destroy'];
const SINGULAR_ACTIONS = ['create', 'new', 'show', 'edit', 'update', 'destroy'];

export interface RailsExtract {
  nodes: Node[];
  references: UnresolvedRef[];
}

interface Token {
  kind: 'id' | 'sym' | 'str' | 'pct' | 'num' | 'op';
  value: string;
  index: number;
  items?: string[];
  interp?: boolean;
}

interface ResourceInfo {
  pathAlts: string[];
  param: string;
  singularName: string;
  singular: boolean;
  controller: string;
}

interface Frame {
  pathAlts?: string[];
  module?: string;
  controller?: string;
  resource?: ResourceInfo;
  on?: 'collection' | 'member' | 'new';
  only?: Set<string> | null;
  except?: Set<string> | null;
  skip?: boolean;
}

interface Env {
  filePath: string;
  now: number;
  routesFile: boolean;
  live: boolean;
  locals: Map<string, string[]>;
  blockBindings: Map<string, string[]>;
  nodes: Node[];
  references: UnresolvedRef[];
  seen: Set<string>;
}

export function extractRailsRoutes(
  filePath: string,
  content: string,
  opts: { routesFile?: boolean } = {},
): RailsExtract {
  const routesFile = opts.routesFile ?? isRoutesFile(filePath);
  const tokens = tokenize(content);
  const env: Env = {
    filePath,
    now: Date.now(),
    routesFile,
    live: routesFile,
    locals: new Map(),
    blockBindings: new Map(),
    nodes: [],
    references: [],
    seen: new Set(),
  };
  walk(tokens, 0, tokens.length, [], env);
  return { nodes: env.nodes, references: env.references };
}

export function isRoutesFile(filePath: string): boolean {
  return /(^|\/)routes\.rb$/.test(filePath) || /\/config\/routes\//.test(filePath);
}

function walk(tokens: Token[], lo: number, hi: number, frames: Frame[], env: Env): void {
  let i = lo;
  let statement = true;
  while (i < hi) {
    const t = tokens[i]!;
    if (t.value === '\n' || t.value === ';' || t.value === 'then') {
      statement = true;
      i++;
      continue;
    }
    if (t.value === 'end' || t.value === '}') {
      statement = t.value === 'end';
      i++;
      continue;
    }

    if (statement && END_OPEN.has(t.value) && !isModifier(tokens, i)) {
      const end = findCloser(tokens, i, hi);
      const opaque = t.value === 'def' || t.value === 'class' || t.value === 'module';
      if (!opaque) walk(tokens, i + 1, end, frames, env);
      i = end + 1;
      statement = true;
      continue;
    }

    if (t.value === '.' && i + 1 < hi && tokens[i + 1]?.kind === 'id') {
      const method = tokens[i + 1]!.value;
      if (method === 'each' || method === 'each_with_index') {
        i = handleEach(tokens, i, hi, frames, env);
        statement = true;
        continue;
      }
      if (method === 'draw' || method === 'append' || method === 'prepend') {
        i = handleLiveBlock(tokens, i + 1, hi, frames, env);
        statement = true;
        continue;
      }
    }

    if (
      statement &&
      t.kind === 'id' &&
      ROUTE_METHODS.has(t.value) &&
      tokens[i - 1]?.value !== '.'
    ) {
      i = handleRoute(tokens, i, hi, frames, env);
      statement = true;
      continue;
    }

    if (
      statement &&
      t.kind === 'id' &&
      tokens[i + 1]?.value === '=' &&
      tokens[i - 1]?.value !== '.'
    ) {
      i = handleAssign(tokens, i, hi, env);
      statement = true;
      continue;
    }

    if (t.value === 'do' || t.value === '{') {
      const end = findCloser(tokens, i, hi);
      walk(tokens, i + 1, end, frames, env);
      i = end + 1;
      statement = true;
      continue;
    }

    statement = false;
    i++;
  }
}

function handleAssign(tokens: Token[], i: number, hi: number, env: Env): number {
  const name = tokens[i]!.value;
  const arr = readArray(tokens, i + 2, hi);
  if (arr && arr.items) env.locals.set(name, arr.items);
  return skipStatement(tokens, arr ? arr.end : i + 2, hi);
}

function handleEach(tokens: Token[], dot: number, hi: number, frames: Frame[], env: Env): number {
  const receiver = tokens[dot - 1];
  let values: string[] | null = null;
  if (receiver?.kind === 'pct' && receiver.items) values = receiver.items;
  else if (receiver?.kind === 'id') values = lookup(receiver.value, env);
  const parsed = parseCall(tokens, dot + 2, hi);
  if (parsed.block == null) return Math.max(parsed.end, dot + 2);
  const params = blockParams(tokens, parsed.block);
  const end = findCloser(tokens, parsed.block, hi);
  const body = afterBlockParams(tokens, parsed.block, end);
  if (values && params[0]) {
    const blockBindings = new Map(env.blockBindings);
    blockBindings.set(params[0], values);
    walk(tokens, body, end, frames, { ...env, blockBindings });
  } else {
    walk(tokens, body, end, frames, env);
  }
  return end + 1;
}

function handleLiveBlock(tokens: Token[], method: number, hi: number, frames: Frame[], env: Env): number {
  const parsed = parseCall(tokens, method + 1, hi);
  if (parsed.block == null) return Math.max(parsed.end, method + 1);
  const end = findCloser(tokens, parsed.block, hi);
  const body = afterBlockParams(tokens, parsed.block, end);
  walk(tokens, body, end, frames, { ...env, live: true });
  return end + 1;
}

function handleRoute(tokens: Token[], i: number, hi: number, frames: Frame[], env: Env): number {
  const name = tokens[i]!.value;
  const line = lineAt(tokens, i);
  const parsed = parseCall(tokens, i + 1, hi);
  const end = parsed.block == null ? parsed.end : findCloser(tokens, parsed.block, hi) + 1;
  if (!env.live || frames.some((f) => f.skip)) {
    if (parsed.block != null && (name === 'namespace' || name === 'scope' || name === 'resources' || name === 'resource' || name === 'collection' || name === 'member' || name === 'new' || name === 'controller' || name === 'constraints')) {
      const body = afterBlockParams(tokens, parsed.block, end - 1);
      const skipFrames = frames.concat([{ skip: true }]);
      walk(tokens, body, end - 1, skipFrames, env);
    }
    return end;
  }

  const bindings = bindingsOf(env);
  const args = parseArgList(parsed.args);

  if (name === 'namespace' || name === 'scope' || name === 'controller' || name === 'constraints') {
    const frame = scopeFrame(name, args, bindings, frames);
    const next = frames.concat(frame);
    if (parsed.block != null) {
      const body = afterBlockParams(tokens, parsed.block, end - 1);
      walk(tokens, body, end - 1, next, env);
    }
    return end;
  }

  if (name === 'collection' || name === 'member' || name === 'new') {
    const on = name as 'collection' | 'member' | 'new';
    if (parsed.block != null) {
      const body = afterBlockParams(tokens, parsed.block, end - 1);
      walk(tokens, body, end - 1, frames.concat([{ on }]), env);
    }
    return end;
  }

  if (name === 'resources' || name === 'resource') {
    emitResources(name === 'resource', args, frames, bindings, env, line);
    if (parsed.block != null) {
      const body = afterBlockParams(tokens, parsed.block, end - 1);
      const resourceFrames = resourceBlockFrames(name === 'resource', args, frames, bindings);
      if (resourceFrames) walk(tokens, body, end - 1, frames.concat(resourceFrames), env);
    }
    return end;
  }

  emitVerb(name, args, frames, bindings, env, line);
  if (parsed.block != null) {
    const body = afterBlockParams(tokens, parsed.block, end - 1);
    walk(tokens, body, end - 1, frames, env);
  }
  return end;
}

function scopeFrame(name: string, args: ArgList, bindings: Map<string, string[]>, frames: Frame[]): Frame {
  if (name === 'constraints') return {};
  if (name === 'controller') {
    const c = asIdent(args.options.get('to') ?? [], bindings) ?? firstController(args, bindings);
    return c ? { controller: c } : { skip: true };
  }

  const moduleOpt = args.options.has('module') ? asPathAlts(args.options.get('module')!, bindings) : undefined;
  const pathOpt = args.options.has('path') ? asPathAlts(args.options.get('path')!, bindings) : undefined;
  const only = args.options.has('only') ? asActionSet(args.options.get('only')!, bindings) : undefined;
  const except = args.options.has('except') ? asActionSet(args.options.get('except')!, bindings) : undefined;

  const frame: Frame = {};
  if (only === 'unknown' || except === 'unknown') {
    // A scope we cannot filter must not leak a half-applied action list.
  } else {
    if (only) frame.only = only;
    if (except) frame.except = except;
  }

  if (moduleOpt === 'unknown') frame.skip = true;
  else if (Array.isArray(moduleOpt) && moduleOpt[0]) frame.module = moduleOpt[0].replace(/^\/+|\/+$/g, '');
  else if (name === 'namespace' && moduleOpt === undefined) {
    const n = firstName(args);
    if (n) frame.module = n;
    else frame.skip = true;
  }

  let pathAlts: string[] | 'nil' | 'unknown' | undefined;
  if (name === 'namespace') {
    pathAlts = pathOpt === undefined ? (firstName(args) ? [firstName(args)!] : 'unknown') : pathOpt;
  } else {
    const positional = positionalPaths(args, bindings);
    if (positional === 'unknown') pathAlts = 'unknown';
    else if (positional && positional.length) pathAlts = positional;
    else pathAlts = pathOpt;
  }

  if (pathAlts === 'unknown') frame.skip = true;
  else if (Array.isArray(pathAlts) && pathAlts.length && !(pathAlts.length === 1 && pathAlts[0] === '')) {
    frame.pathAlts = pathAlts;
  }
  // inherited action filters live on this frame; a later resources call reads them
  if (name === 'scope' || name === 'namespace') {
    const inherited = inheritedActions(frames);
    if (frame.only === undefined && frame.except === undefined && inherited) {
      frame.only = inherited.only;
      frame.except = inherited.except;
    }
  }
  return frame;
}

function emitResources(
  singular: boolean,
  args: ArgList,
  frames: Frame[],
  bindings: Map<string, string[]>,
  env: Env,
  line: number,
): void {
  const names = resourceNames(args);
  if (names.length === 0) return;
  // `resources :posts, :comments` is one declaration per name; options apply to each.
  for (const resName of names) {
    emitOneResource(singular, resName, args, frames, bindings, env, line);
  }
}

function emitOneResource(
  singular: boolean,
  resName: string,
  args: ArgList,
  frames: Frame[],
  bindings: Map<string, string[]>,
  env: Env,
  line: number,
): void {
  const pathAlts = resourcePathAlts(resName, args, bindings);
  if (!pathAlts) return;
  const actions = selectedActions(singular, args, frames, bindings);
  if (!actions) return;

  const controller = resourceController(singular, resName, args, bindings);
  if (!controller) return;
  const param = resourceParam(args) ?? 'id';
  const info: ResourceInfo = {
    pathAlts,
    param,
    singularName: singular ? resName : singularize(resName),
    singular,
    controller,
  };
  const outer = routeBases(frames, bindings);
  if (!outer) return;
  const moduleName = composeModule(frames, moduleOpt(args, bindings));
  const refController = qualifyController(controller, moduleName);

  for (const action of actions) {
    const segs = resourceSegment(info, action === 'index' || action === 'create' ? 'collection' : action === 'new' ? 'new' : 'member');
    const bases = product(outer, segs, bindings);
    if (!bases) continue;
    const methods = action === 'update' ? ['PATCH', 'PUT'] : [REST_METHOD[action]!];
    for (const base of bases) {
      for (const method of methods) {
        emitNode(env, method, base, `${refController}#${action}`, line);
      }
    }
  }
}

const REST_METHOD: Record<string, string> = {
  index: 'GET',
  create: 'POST',
  new: 'GET',
  show: 'GET',
  edit: 'GET',
  update: 'PATCH',
  destroy: 'DELETE',
};

function resourceBlockFrames(
  singular: boolean,
  args: ArgList,
  frames: Frame[],
  bindings: Map<string, string[]>,
): Frame[] | null {
  const names = resourceNames(args);
  // A block on `resources :a, :b` is applied to each in Rails by recursion; the
  // block in source belongs to the call as a whole. Use the last name, matching
  // `resources.pop` in Mapper#resources.
  const resName = names[names.length - 1];
  if (!resName) return null;
  const pathAlts = resourcePathAlts(resName, args, bindings);
  const controller = resourceController(singular, resName, args, bindings);
  if (!pathAlts || !controller) return [{ skip: true }];
  const param = resourceParam(args) ?? 'id';
  const parent = activeResource(frames);
  const nested: Frame[] = [];
  if (parent) {
    const seg = parent.singular
      ? parent.pathAlts
      : parent.pathAlts.map((p) => `${trimSlashes(p)}/:${parent.singularName}_${parent.param}`);
    nested.push({ pathAlts: seg });
  }
  const mod = moduleOpt(args, bindings);
  nested.push({
    resource: {
      pathAlts,
      param,
      singularName: singular ? resName : singularize(resName),
      singular,
      controller,
    },
    ...(mod ? { module: mod } : {}),
    controller,
  });
  return nested;
}

function emitVerb(
  name: string,
  args: ArgList,
  frames: Frame[],
  bindings: Map<string, string[]>,
  env: Env,
  line: number,
): void {
  const onOpt = asIdent(args.options.get('on') ?? [], bindings);
  const on = onOpt === 'collection' || onOpt === 'member' || onOpt === 'new' ? onOpt : null;
  const framesForRoute = on ? frames.concat([{ on }]) : frames;
  const bases = routeBases(framesForRoute, bindings);
  if (!bases) return;

  const methods = verbList(name, args, bindings);
  if (!methods) return;

  const pairs = hashRocketPaths(args);
  const positional = positionalRoutePaths(args, bindings);
  type Item = { path: string; to: string | null; action: string | null };
  const items: Item[] = [];

  if (name === 'root') {
    const direct = args.positional.find((t) => t.kind === 'str' && t.value.includes('#'));
    const to = stringOpt(args, 'to', bindings) ?? direct?.value ?? null;
    items.push({ path: '', to: to && to.includes('#') ? to : to, action: null });
  } else if (positional === 'unknown') {
    return;
  } else if (pairs.length && (!positional || positional.length === 0)) {
    for (const pair of pairs) items.push({ path: pair.path, to: pair.to, action: null });
  } else if (positional) {
    const to = stringOpt(args, 'to', bindings) ?? (pairs.length === 1 ? pairs[0]!.to : null);
    const action = asIdent(args.options.get('action') ?? [], bindings);
    for (const path of positional) items.push({ path, to, action });
  }

  const moduleName = composeModule(framesForRoute, null);
  const scopeController = composeController(framesForRoute);

  for (const base of bases) {
    for (const item of items) {
      const expanded = expandTemplates(item.path, bindings);
      if (!expanded) continue;
      for (const rel of expanded) {
        const full = finalize(joinPath(base, rel));
        if (full.includes('#{')) continue;
        const target = resolveTarget(rel, item.to, item.action, scopeController, moduleName);
        for (const method of methods) {
          emitNode(env, method, full, target, line);
        }
      }
    }
  }
}

function emitNode(env: Env, method: string, path: string, target: string | null, line: number): void {
  if (!VERBS.has(method)) return;
  if (!path.startsWith('/')) return;
  const key = `${method} ${path} ${target ?? ''}`;
  if (env.seen.has(key)) return;
  env.seen.add(key);
  const id = `route:${env.filePath}:${line}:${method}:${path}:${target ?? ''}`;
  const node: Node = {
    id,
    kind: 'route',
    name: `${method} ${path}`,
    qualifiedName: `${env.filePath}::route:${method}:${path}:${target ?? ''}`,
    filePath: env.filePath,
    startLine: line,
    endLine: line,
    startColumn: 0,
    endColumn: 0,
    language: 'ruby',
    updatedAt: env.now,
  };
  env.nodes.push(node);
  if (target) {
    env.references.push({
      fromNodeId: id,
      referenceName: target,
      referenceKind: 'references',
      line,
      column: 0,
      filePath: env.filePath,
      language: 'ruby',
    });
  }
}

function resolveTarget(
  path: string,
  to: string | null,
  actionOpt: string | null,
  scopeController: string | null,
  moduleName: string,
): string | null {
  let controller: string | null = null;
  let action: string | null = null;
  if (to && to.includes('#')) {
    const hash = to.indexOf('#');
    controller = to.slice(0, hash);
    action = to.slice(hash + 1);
  } else if (to && /^[A-Za-z_]\w*$/.test(to)) {
    controller = scopeController;
    action = to;
  } else if (actionOpt) {
    controller = scopeController;
    action = actionOpt;
  } else if (isShorthand(path)) {
    const body = path.replace(/^\//, '').replace(/\/([^/]*)$/, '#$1').replace(/-/g, '_');
    const hash = body.indexOf('#');
    controller = body.slice(0, hash);
    action = body.slice(hash + 1);
  } else {
    const seg = path.split('/').filter(Boolean).pop() ?? '';
    if (/^[\w-]+$/.test(seg) && !seg.startsWith(':') && !seg.includes('*')) {
      action = seg.replace(/-/g, '_');
      controller = scopeController;
    }
  }
  if (!action || action.includes('#{')) return null;
  if (controller?.startsWith('/')) controller = controller.slice(1);
  else controller = qualifyController(controller, moduleName);
  if (!controller || controller.includes('#{')) return null;
  return `${controller}#${action}`;
}

function isShorthand(path: string): boolean {
  return /^\/?[-\w]+\/[-\w/]+$/.test(path);
}

function qualifyController(controller: string | null, moduleName: string): string | null {
  if (controller?.startsWith('/')) return controller.slice(1);
  if (!moduleName) return controller;
  return controller ? `${moduleName}/${controller}` : moduleName;
}

function composeModule(frames: Frame[], extra: string | null): string {
  const parts: string[] = [];
  for (const f of frames) {
    if (f.module) parts.push(f.module);
  }
  if (extra) parts.push(extra);
  return parts.join('/');
}

function composeController(frames: Frame[]): string | null {
  let controller: string | null = null;
  for (const f of frames) {
    if (f.controller) controller = f.controller;
    else if (f.resource) controller = f.resource.controller;
  }
  return controller;
}

function activeResource(frames: Frame[]): ResourceInfo | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i]!.resource) return frames[i]!.resource!;
  }
  return null;
}

function routeBases(frames: Frame[], bindings: Map<string, string[]>): string[] | null {
  if (frames.some((f) => f.skip)) return null;
  let prefixes: string[] = [''];
  let res: ResourceInfo | null = null;
  let mode: 'bare' | 'collection' | 'member' | 'new' | null = null;
  for (const f of frames) {
    if (f.pathAlts) {
      const next = product(prefixes, f.pathAlts, bindings);
      if (!next) return null;
      prefixes = next;
    }
    if (f.resource) {
      res = f.resource;
      mode = 'bare';
    }
    if (f.on) mode = f.on;
  }
  if (!res || !mode) return prefixes.map((p) => finalize(p));
  return product(prefixes, resourceSegment(res, mode), bindings);
}

function resourceSegment(res: ResourceInfo, mode: 'bare' | 'collection' | 'member' | 'new'): string[] {
  const paths = res.pathAlts.map(trimSlashes);
  if (mode === 'collection') return paths;
  if (mode === 'new') return paths.map((p) => `${p}/new`);
  if (mode === 'member') {
    if (res.singular) return paths;
    return paths.map((p) => `${p}/:${res.param}`);
  }
  if (res.singular) return paths;
  return paths.map((p) => `${p}/:${res.singularName}_${res.param}`);
}

function product(prefixes: string[], alts: string[], bindings: Map<string, string[]>): string[] | null {
  const out: string[] = [];
  for (const alt of alts) {
    const parts = expandTemplates(alt, bindings);
    if (!parts) return null;
    for (const prefix of prefixes) {
      for (const part of parts) out.push(finalize(joinPath(prefix, part)));
    }
  }
  return out.length ? out : null;
}

function selectedActions(
  singular: boolean,
  args: ArgList,
  frames: Frame[],
  bindings: Map<string, string[]>,
): string[] | null {
  const ownOnly = args.options.has('only') ? asActionSet(args.options.get('only')!, bindings) : undefined;
  const ownExcept = args.options.has('except') ? asActionSet(args.options.get('except')!, bindings) : undefined;
  if (ownOnly === 'unknown' || ownExcept === 'unknown') return null;
  let only = ownOnly ?? null;
  let except = ownExcept ?? null;
  if (only == null && except == null) {
    const inherited = inheritedActions(frames);
    only = inherited?.only ?? null;
    except = inherited?.except ?? null;
  }
  let actions = singular ? [...SINGULAR_ACTIONS] : [...PLURAL_ACTIONS];
  if (only) actions = [...only].filter((a) => (singular ? SINGULAR_ACTIONS : PLURAL_ACTIONS).includes(a));
  if (except) actions = actions.filter((a) => !except!.has(a));
  return actions;
}

function inheritedActions(frames: Frame[]): { only: Set<string> | null; except: Set<string> | null } | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.only !== undefined || f.except !== undefined) {
      return { only: f.only ?? null, except: f.except ?? null };
    }
  }
  return null;
}

function resourceNames(args: ArgList): string[] {
  const names: string[] = [];
  for (const t of args.positional) {
    if (t.kind === 'sym') names.push(t.value);
    else if (t.kind === 'str' && !t.interp) names.push(t.value);
  }
  return names;
}

function resourcePathAlts(resName: string, args: ArgList, bindings: Map<string, string[]>): string[] | null {
  if (!args.options.has('path')) return [resName];
  const path = asPathAlts(args.options.get('path')!, bindings);
  if (path === 'nil' || path === 'unknown' || path.length === 0) return null;
  return path;
}

function resourceController(singular: boolean, resName: string, args: ArgList, bindings: Map<string, string[]>): string | null {
  if (args.options.has('controller')) {
    const c = asPathAlts(args.options.get('controller')!, bindings);
    if (!Array.isArray(c) || c.length !== 1) return null;
    return trimSlashes(c[0]!).replace(/-/g, '_');
  }
  return singular ? pluralize(resName) : resName;
}

function resourceParam(args: ArgList): string | null {
  const raw = args.options.get('param');
  if (!raw || raw.length === 0) return null;
  const t = raw[0]!;
  if (t.kind === 'sym' || (t.kind === 'str' && !t.interp)) return t.value;
  return null;
}

function moduleOpt(args: ArgList, bindings: Map<string, string[]>): string | null {
  if (!args.options.has('module')) return null;
  const m = asPathAlts(args.options.get('module')!, bindings);
  if (!Array.isArray(m) || !m[0]) return null;
  return trimSlashes(m[0]);
}

function firstName(args: ArgList): string | null {
  for (const t of args.positional) {
    if (t.kind === 'sym') return t.value;
    if (t.kind === 'str' && !t.interp) return t.value;
  }
  return null;
}

function firstController(args: ArgList, bindings: Map<string, string[]>): string | null {
  const n = firstName(args);
  if (n) return n;
  if (args.options.has('controller')) {
    const c = asPathAlts(args.options.get('controller')!, bindings);
    if (Array.isArray(c) && c[0]) return trimSlashes(c[0]);
  }
  return null;
}

function positionalPaths(args: ArgList, bindings: Map<string, string[]>): string[] | 'unknown' | null {
  const out: string[] = [];
  for (const t of args.positional) {
    if (t.kind === 'str') {
      if (t.interp) {
        const ex = expandTemplates(t.value, bindings);
        if (!ex) return 'unknown';
        out.push(...ex);
      } else out.push(t.value);
    } else if (t.kind === 'sym') out.push(t.value);
  }
  return out.length ? out : null;
}

function positionalRoutePaths(args: ArgList, bindings: Map<string, string[]>): string[] | 'unknown' | null {
  const out: string[] = [];
  for (const t of args.positional) {
    if (t.kind === 'str') {
      // `controller#action` is a target, not a path. `#{name}` is a path.
      if (t.value.includes('#') && !t.value.includes('#{')) continue;
      if (t.interp) {
        const ex = expandTemplates(t.value, bindings);
        if (!ex) return 'unknown';
        out.push(...ex);
      } else out.push(t.value);
    } else if (t.kind === 'sym') {
      out.push(t.value);
    } else if (t.kind === 'id') {
      const bound = lookupToken(t.value, bindings);
      if (!bound) return 'unknown';
      out.push(...bound);
    }
  }
  return out.length ? out : null;
}

function hashRocketPaths(args: ArgList): Array<{ path: string; to: string | null }> {
  const out: Array<{ path: string; to: string | null }> = [];
  const tokens = args.raw;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.value === '{' || t.value === '[' || t.value === '(') depth++;
    else if (t.value === '}' || t.value === ']' || t.value === ')') depth = Math.max(0, depth - 1);
    if (t.kind === 'str' && tokens[i + 1]?.value === '=>') {
      const rhs = tokens[i + 2];
      const to = rhs && rhs.kind === 'str' ? rhs.value : null;
      // A top-level `"path" =>` is the shorthand for `to:`, not a second route
      // next to a positional path. Only hash-wrapped pairs are extra routes.
      if (depth > 0) out.push({ path: t.value, to });
    }
  }
  return out;
}

function verbList(name: string, args: ArgList, bindings: Map<string, string[]>): string[] | null {
  if (name === 'root') return ['GET'];
  if (name !== 'match') return [name.toUpperCase()];
  const via = args.options.has('via') ? asActionSet(args.options.get('via')!, bindings) : 'unknown';
  if (via === 'unknown' || !via) return null;
  const methods = [...via].map((v) => v.toUpperCase()).filter((v) => VERBS.has(v));
  return methods.length ? methods : null;
}

function stringOpt(args: ArgList, key: string, bindings: Map<string, string[]>): string | null {
  const raw = args.options.get(key);
  if (!raw) return null;
  const t = raw[0];
  if (!t) return null;
  if (t.kind === 'str') {
    if (t.interp) {
      const ex = expandTemplates(t.value, bindings);
      return ex && ex.length === 1 ? ex[0]! : null;
    }
    return t.value;
  }
  if (t.kind === 'sym') return t.value;
  return null;
}

function asIdent(tokens: Token[], bindings: Map<string, string[]>): string | null {
  const t = tokens[0];
  if (!t) return null;
  if (t.kind === 'sym') return t.value;
  if (t.kind === 'str' && !t.interp) return t.value;
  if (t.kind === 'id') {
    const b = bindings.get(t.value);
    if (b && b.length === 1) return b[0]!;
    if (!b && t.value !== 'nil' && t.value !== 'false' && t.value !== 'true') return null;
  }
  return null;
}

function asPathAlts(tokens: Token[], bindings: Map<string, string[]>): string[] | 'nil' | 'unknown' {
  const t = tokens[0];
  if (!t) return 'unknown';
  if (t.kind === 'id' && (t.value === 'nil' || t.value === 'false')) return 'nil';
  if (t.kind === 'sym') return [t.value];
  if (t.kind === 'str') {
    if (!t.interp) return [t.value];
    return expandTemplates(t.value, bindings) ?? 'unknown';
  }
  if (t.kind === 'id') {
    const b = bindings.get(t.value);
    return b ?? 'unknown';
  }
  if (t.kind === 'pct' && t.items) return t.items;
  return 'unknown';
}

function asActionSet(tokens: Token[], bindings: Map<string, string[]>): Set<string> | 'unknown' | null {
  const t = tokens[0];
  if (!t) return 'unknown';
  if (t.kind === 'sym' || (t.kind === 'str' && !t.interp)) return new Set([t.value]);
  if (t.kind === 'pct') return t.items ? new Set(t.items) : 'unknown';
  if (t.kind === 'id') {
    const b = bindings.get(t.value);
    return b ? new Set(b) : 'unknown';
  }
  if (t.value === '[') {
    const set = new Set<string>();
    for (const x of tokens) {
      if (x.kind === 'sym' || (x.kind === 'str' && !x.interp)) set.add(x.value);
      else if (x.kind === 'pct') {
        if (!x.items) return 'unknown';
        for (const item of x.items) set.add(item);
      } else if (x.kind === 'id' && x.value !== 'nil') return 'unknown';
    }
    return set;
  }
  return 'unknown';
}

interface ArgList {
  positional: Token[];
  options: Map<string, Token[]>;
  raw: Token[];
}

function parseArgList(raw: Token[]): ArgList {
  const positional: Token[] = [];
  const options = new Map<string, Token[]>();
  let i = 0;
  while (i < raw.length) {
    const t = raw[i]!;
    if (t.kind === 'id' && raw[i + 1]?.value === ':') {
      const key = t.value;
      const value = readValue(raw, i + 2);
      options.set(key, value.tokens);
      i = value.end;
      if (raw[i]?.value === ',') i++;
      continue;
    }
    if (t.kind === 'sym' && raw[i + 1]?.value === '=>') {
      const value = readValue(raw, i + 2);
      options.set(t.value, value.tokens);
      i = value.end;
      if (raw[i]?.value === ',') i++;
      continue;
    }
    if (t.value === ',') {
      i++;
      continue;
    }
    // Hash-rocket path pairs and nested hashes stay in `raw` for the pair scan.
    if (t.value === '{' || t.value === '(' || t.value === '[') {
      const value = readValue(raw, i);
      i = value.end;
      if (raw[i]?.value === ',') i++;
      continue;
    }
    positional.push(t);
    i++;
    if (raw[i]?.value === '=>') {
      // `"path" => "controller#action"` is the `to:` shorthand.
      i++;
      const value = readValue(raw, i);
      if ((t.kind === 'str' || t.kind === 'sym' || t.kind === 'id') && !options.has('to')) {
        options.set('to', value.tokens);
      }
      i = value.end;
      if (raw[i]?.value === ',') i++;
    }
  }
  return { positional, options, raw };
}

function readValue(tokens: Token[], i: number): { tokens: Token[]; end: number } {
  const t = tokens[i];
  if (!t) return { tokens: [], end: i };
  if (t.value === '[' || t.value === '{' || t.value === '(') {
    const grouped = readGroup(tokens, i);
    return consumeTrail(tokens, grouped.tokens, grouped.end);
  }
  return consumeTrail(tokens, [t], i + 1);
}

/** `Foo.bar`, `Foo::Bar`, `redirect(...)`, `proc { ... }` are one value. */
function consumeTrail(tokens: Token[], acc: Token[], i: number): { tokens: Token[]; end: number } {
  let j = i;
  while (j < tokens.length) {
    const t = tokens[j]!;
    if ((t.value === '.' || t.value === '::') && tokens[j + 1]?.kind === 'id') {
      acc.push(t, tokens[j + 1]!);
      j += 2;
      continue;
    }
    if ((t.value === '(' || t.value === '{' || t.value === '[') && acc.length > 0) {
      const grouped = readGroup(tokens, j);
      acc.push(...grouped.tokens);
      j = grouped.end;
      continue;
    }
    if (t.value === '?' || t.value === '!') {
      acc.push(t);
      j++;
      continue;
    }
    break;
  }
  return { tokens: acc, end: j };
}

function readGroup(tokens: Token[], i: number): { tokens: Token[]; end: number } {
  const t = tokens[i]!;
  const close = t.value === '[' ? ']' : t.value === '{' ? '}' : ')';
  const open = t.value;
  let depth = 0;
  const acc: Token[] = [];
  let j = i;
  for (; j < tokens.length; j++) {
    const c = tokens[j]!;
    acc.push(c);
    if (c.value === open) depth++;
    if (c.value === close) {
      depth--;
      if (depth === 0) return { tokens: acc, end: j + 1 };
    }
  }
  return { tokens: acc, end: j };
}

interface ParsedCall {
  args: Token[];
  end: number;
  block: number | null;
}

function parseCall(tokens: Token[], start: number, hi: number): ParsedCall {
  const args: Token[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let i = start;
  while (i < hi) {
    const t = tokens[i]!;
    if (paren === 0 && bracket === 0 && brace === 0) {
      if (t.value === 'do') return { args, end: i, block: i };
      if (t.value === '{' && args.length === 0 && isBlockBrace(tokens, i)) return { args, end: i, block: i };
      if ((t.value === '\n' || t.value === ';') && !callContinues(tokens, i, hi, paren)) {
        return { args, end: i, block: null };
      }
      if ((t.value === 'if' || t.value === 'unless' || t.value === 'while' || t.value === 'until') && args.length > 0 && !isModifierKeywordLabel(tokens, i)) {
        // Statement modifier (`get "become" if Rails.env.development?`) — the
        // route is real; the condition is not a block and not a path.
        i++;
        while (i < hi && tokens[i]?.value !== '\n' && tokens[i]?.value !== ';') i++;
        return { args, end: i, block: null };
      }
    }
    if (t.value === '(') paren++;
    else if (t.value === ')') paren = Math.max(0, paren - 1);
    else if (t.value === '[') bracket++;
    else if (t.value === ']') bracket = Math.max(0, bracket - 1);
    else if (t.value === '{') brace++;
    else if (t.value === '}') brace = Math.max(0, brace - 1);
    if (t.value !== '\n') args.push(t);
    i++;
  }
  return { args, end: i, block: null };
}

function isBlockBrace(tokens: Token[], i: number): boolean {
  const prev = prevSignificant(tokens, i - 1);
  if (!prev) return true;
  if (prev.value === ':' || prev.value === '=>' || prev.value === ',' || prev.value === '(' || prev.value === '[' || prev.value === '=') {
    return false;
  }
  return true;
}

function callContinues(tokens: Token[], nl: number, hi: number, _paren: number): boolean {
  const prev = prevSignificant(tokens, nl - 1);
  if (!prev) return false;
  if (prev.value === ',' || prev.value === '=>' || prev.value === ':' || prev.value === '.' || prev.value === '\\' || prev.value === '(' || prev.value === '[' || prev.value === '{') {
    return true;
  }
  const next = nextSignificant(tokens, nl + 1, hi);
  if (!next) return false;
  if (next.value === 'do') return true;
  if (next.kind === 'id' && tokens[tokens.indexOf(next) + 1]?.value === ':') return true;
  return false;
}

function isModifierKeywordLabel(tokens: Token[], i: number): boolean {
  return tokens[i + 1]?.value === ':';
}

function isModifier(tokens: Token[], i: number): boolean {
  const v = tokens[i]?.value;
  if (v !== 'if' && v !== 'unless' && v !== 'while' && v !== 'until') return false;
  // Statement-modifier form sits after an expression. A block form is at the
  // start of a statement — the caller only invokes this when `statement` is true,
  // so a keyword we were told is at statement start is a real block.
  return false;
}

function findCloser(tokens: Token[], opener: number, hi: number): number {
  const kind = tokens[opener]?.value === '{' ? 'brace' : 'end';
  const stack: Array<'brace' | 'end'> = [kind];
  let statement = true;
  for (let j = opener + 1; j < hi; j++) {
    const t = tokens[j]!;
    if (t.value === '\n' || t.value === ';' || t.value === 'then') {
      statement = true;
      continue;
    }
    if (t.value === '{') {
      stack.push('brace');
      statement = false;
      continue;
    }
    if (t.value === '}') {
      if (stack[stack.length - 1] === 'brace') stack.pop();
      statement = false;
      if (stack.length === 0) return j;
      continue;
    }
    if (t.value === 'do' || (statement && END_OPEN.has(t.value))) {
      stack.push('end');
      statement = false;
      continue;
    }
    if (t.value === 'end') {
      if (stack[stack.length - 1] === 'end') stack.pop();
      statement = true;
      if (stack.length === 0) return j;
      continue;
    }
    statement = false;
  }
  return hi - 1;
}

function blockParams(tokens: Token[], opener: number): string[] {
  if (tokens[opener + 1]?.value !== '|') return [];
  const names: string[] = [];
  for (let j = opener + 2; j < tokens.length && tokens[j]?.value !== '|'; j++) {
    if (tokens[j]?.kind === 'id') names.push(tokens[j]!.value);
  }
  return names;
}

function afterBlockParams(tokens: Token[], opener: number, end: number): number {
  if (tokens[opener + 1]?.value !== '|') return opener + 1;
  for (let j = opener + 2; j < end; j++) {
    if (tokens[j]?.value === '|') return j + 1;
  }
  return opener + 1;
}

function readArray(tokens: Token[], i: number, hi: number): { items: string[] | null; end: number } | null {
  const t = tokens[i];
  if (!t || i >= hi) return null;
  if (t.kind === 'pct') return { items: t.items ?? null, end: i + 1 };
  if (t.value === '[') {
    const items: string[] = [];
    let j = i + 1;
    for (; j < hi && tokens[j]?.value !== ']'; j++) {
      const c = tokens[j]!;
      if (c.kind === 'str' && !c.interp) items.push(c.value);
      else if (c.kind === 'sym') items.push(c.value);
      else if (c.value === ',') continue;
      else if (c.value === '\n') continue;
      else return { items: null, end: j };
    }
    return { items, end: j + 1 };
  }
  return null;
}

function skipStatement(tokens: Token[], i: number, hi: number): number {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let j = i;
  while (j < hi) {
    const t = tokens[j]!;
    if (t.value === '(') paren++;
    else if (t.value === ')') paren = Math.max(0, paren - 1);
    else if (t.value === '[') bracket++;
    else if (t.value === ']') bracket = Math.max(0, bracket - 1);
    else if (t.value === '{') brace++;
    else if (t.value === '}') brace = Math.max(0, brace - 1);
    if ((t.value === '\n' || t.value === ';') && paren === 0 && bracket === 0 && brace === 0) {
      if (!callContinues(tokens, j, hi, paren)) return j + 1;
    }
    j++;
  }
  return j;
}

function lookup(name: string, env: Env): string[] | null {
  return env.blockBindings.get(name) ?? env.locals.get(name) ?? null;
}

function lookupToken(name: string, bindings: Map<string, string[]>): string[] | null {
  return bindings.get(name) ?? null;
}

function bindingsOf(env: Env): Map<string, string[]> {
  const m = new Map(env.locals);
  for (const [k, v] of env.blockBindings) m.set(k, v);
  return m;
}

function prevSignificant(tokens: Token[], i: number): Token | null {
  for (let j = i; j >= 0; j--) {
    if (tokens[j] && tokens[j]!.value !== '\n') return tokens[j]!;
  }
  return null;
}

function nextSignificant(tokens: Token[], i: number, hi: number): Token | null {
  for (let j = i; j < hi; j++) {
    if (tokens[j] && tokens[j]!.value !== '\n') return tokens[j]!;
  }
  return null;
}

function lineAt(tokens: Token[], i: number): number {
  let line = 1;
  for (let j = 0; j < i; j++) {
    if (tokens[j]?.value === '\n') line++;
  }
  return line;
}

function expandTemplates(path: string, bindings: Map<string, string[]>): string[] | null {
  const names = [...path.matchAll(/#\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]!);
  if (names.some((n) => !bindings.has(n))) return null;
  if (/#\{[^}]*[^A-Za-z_}\w][^}]*\}/.test(path) || /#\{[^}]+\}/.test(path.replace(/#\{[A-Za-z_]\w*\}/g, ''))) {
    return null;
  }
  let paths = [path];
  for (const name of [...new Set(names)]) {
    const values = bindings.get(name)!;
    const next: string[] = [];
    for (const p of paths) {
      for (const v of values) next.push(p.split(`#{${name}}`).join(v));
    }
    paths = next;
  }
  if (paths.some((p) => p.includes('#{'))) return null;
  return paths;
}

function joinPath(base: string, rel: string): string {
  if (!rel || rel === '/') return base || '';
  if (!base) return rel;
  if (base === '/') return rel.startsWith('/') ? rel : `/${rel}`;
  return `${base.replace(/\/+$/, '')}/${rel.replace(/^\/+/, '')}`;
}

function finalize(path: string): string {
  if (!path || path === '/') return '/';
  let out = path.startsWith('/') ? path : `/${path}`;
  out = out.replace(/\/{2,}/g, '/');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '');
}

function pluralize(w: string): string {
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  return w + 's';
}

function singularize(w: string): string {
  const uncountable = new Set(['sheep', 'series', 'species', 'news', 'data', 'equipment']);
  if (uncountable.has(w)) return w;
  if (w.endsWith('ies') && w.length > 3) return w.slice(0, -3) + 'y';
  if (/(xes|ches|shes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('ses') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 1) return w.slice(0, -1);
  return w;
}

const PCT_OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;
  let lineStart = true;
  while (i < n) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      tokens.push({ kind: 'op', value: '\n', index: i });
      i++;
      lineStart = true;
      continue;
    }
    if (lineStart && src.startsWith('=begin', i) && (i === 0 || src[i - 1] === '\n')) {
      i += '=begin'.length;
      while (i < n) {
        if (src[i] === '\n') {
          tokens.push({ kind: 'op', value: '\n', index: i });
          let j = i + 1;
          while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
          if (src.startsWith('=end', j)) {
            i = j + '=end'.length;
            while (i < n && src[i] !== '\n') i++;
            break;
          }
        }
        i++;
      }
      lineStart = true;
      continue;
    }
    lineStart = false;
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let value = '';
      let interp = false;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          value += src[i + 1] === 'n' ? '\n' : src[i + 1];
          i += 2;
          continue;
        }
        if (quote === '"' && src[i] === '#' && src[i + 1] === '{') interp = true;
        if (src[i] === '\n') break;
        value += src[i];
        i++;
      }
      if (i < n && src[i] === quote) i++;
      tokens.push({ kind: 'str', value, index: start, interp });
      continue;
    }
    if (c === '%' && isPercentLiteral(src, i)) {
      const start = i;
      i++;
      let word = '';
      while (i < n && /[A-Za-z]/.test(src[i]!)) {
        word += src[i];
        i++;
      }
      const open = src[i];
      if (!open || !(PCT_OPEN[open] || open !== undefined)) {
        tokens.push({ kind: 'op', value: '%', index: start });
        continue;
      }
      const close = PCT_OPEN[open] ?? open;
      i++;
      const bodyStart = i;
      let depth = 1;
      while (i < n && depth > 0) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === open && open !== close) depth++;
        else if (src[i] === close) depth--;
        if (depth > 0) i++;
      }
      const body = src.slice(bodyStart, i);
      if (i < n && src[i] === close) i++;
      const kind = word;
      const interpolating = kind === 'W' || kind === 'I' || kind === 'Q' || kind === '';
      const hasInterp = interpolating && body.includes('#{');
      const listKind = kind === 'w' || kind === 'W' || kind === 'i' || kind === 'I';
      let items: string[] | undefined;
      if (listKind && !hasInterp) {
        items = body.split(/\s+/).filter(Boolean);
      }
      tokens.push({ kind: 'pct', value: body, index: start, items, interp: hasInterp });
      continue;
    }
    if (c === ':' && i + 1 < n && /[A-Za-z_]/.test(src[i + 1]!)) {
      const start = i;
      i++;
      let v = '';
      while (i < n && /[\w]/.test(src[i]!)) {
        v += src[i];
        i++;
      }
      tokens.push({ kind: 'sym', value: v, index: start });
      continue;
    }
    if (c === ':' && (src[i + 1] === '"' || src[i + 1] === "'")) {
      const start = i;
      const quote = src[i + 1]!;
      i += 2;
      let v = '';
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          v += src[i + 1];
          i += 2;
          continue;
        }
        v += src[i];
        i++;
      }
      if (i < n && src[i] === quote) i++;
      tokens.push({ kind: 'sym', value: v, index: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      let v = '';
      while (i < n && /[\w]/.test(src[i]!)) {
        v += src[i];
        i++;
      }
      tokens.push({ kind: 'id', value: v, index: start });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      let v = '';
      while (i < n && /[0-9_]/.test(src[i]!)) {
        v += src[i];
        i++;
      }
      tokens.push({ kind: 'num', value: v, index: start });
      continue;
    }
    if (c === '=' && src[i + 1] === '>') {
      tokens.push({ kind: 'op', value: '=>', index: i });
      i += 2;
      continue;
    }
    if (c === ':' && src[i + 1] === ':') {
      tokens.push({ kind: 'op', value: '::', index: i });
      i += 2;
      continue;
    }
    if (c === '&' && src[i + 1] === '&') {
      tokens.push({ kind: 'op', value: '&&', index: i });
      i += 2;
      continue;
    }
    if (c === '|' && src[i + 1] === '|') {
      tokens.push({ kind: 'op', value: '||', index: i });
      i += 2;
      continue;
    }
    if (c === '=' && src[i + 1] === '=') {
      tokens.push({ kind: 'op', value: '==', index: i });
      i += 2;
      continue;
    }
    if (c === '!' && src[i + 1] === '=') {
      tokens.push({ kind: 'op', value: '!=', index: i });
      i += 2;
      continue;
    }
    if (c === '<' && src[i + 1] === '=') {
      tokens.push({ kind: 'op', value: '<=', index: i });
      i += 2;
      continue;
    }
    if (c === '/' && looksLikeRegex(src, i)) {
      const start = i;
      i++;
      while (i < n && src[i] !== '\n' && src[i] !== '/') {
        if (src[i] === '\\') i += 2;
        else i++;
      }
      if (src[i] === '/') i++;
      tokens.push({ kind: 'op', value: '/', index: start });
      continue;
    }
    tokens.push({ kind: 'op', value: c, index: i });
    i++;
  }
  return tokens;
}

function isPercentLiteral(src: string, i: number): boolean {
  let j = i + 1;
  if (j >= src.length) return false;
  if (/[A-Za-z]/.test(src[j]!)) {
    while (j < src.length && /[A-Za-z]/.test(src[j]!)) j++;
  }
  const open = src[j];
  return !!open && Object.prototype.hasOwnProperty.call(PCT_OPEN, open);
}

function looksLikeRegex(src: string, i: number): boolean {
  const before = src.slice(Math.max(0, i - 24), i);
  return /(?:^|[=(:,\[{!]|\s)$/.test(before) && i + 1 < src.length && src[i + 1] !== ' ' && src[i + 1] !== '=';
}
