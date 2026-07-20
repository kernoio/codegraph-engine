/**
 * Public plugin API for extending CodeGraph with framework resolvers
 * and language extractors (Kerno fork).
 *
 * Plugins are loaded explicitly via codegraph.json `plugins` (plus always-on
 * built-ins). No auto-discovery from node_modules.
 */

import type { FrameworkResolver } from '../resolution/types';

export type { FrameworkResolver } from '../resolution/types';

export type PluginType = 'framework-resolver' | 'language-extractor' | 'bridge';

export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface PluginContext {
  codeGraphVersion: string;
  projectRoot: string;
  logger: PluginLogger;
  config: Record<string, unknown>;
}

export interface CodeGraphPlugin {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  provides?: {
    frameworkResolvers?: string[];
    languages?: string[];
    bridges?: string[];
  };
  validate?(): void;
  initialize?(context: PluginContext): void | Promise<void>;
  destroy?(): void | Promise<void>;
  /** Framework resolvers contributed by this plugin */
  resolvers?: FrameworkResolver[];
}

export function isCodeGraphPlugin(value: unknown): value is CodeGraphPlugin {
  if (!value || typeof value !== 'object') return false;
  const p = value as CodeGraphPlugin;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.version === 'string' &&
    (p.type === 'framework-resolver' ||
      p.type === 'language-extractor' ||
      p.type === 'bridge')
  );
}
