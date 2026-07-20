/**
 * Plugin registry and loader for the Kerno codegraph-engine fork.
 */

import { createRequire } from 'module';
import * as path from 'path';
import {
  CodeGraphPlugin,
  isCodeGraphPlugin,
  PluginContext,
  PluginType,
} from './api';
import { registerFrameworkResolver } from '../resolution/frameworks';
import { logWarn, logDebug } from '../errors';

export interface PluginRegistry {
  loadPlugin(packageName: string, fromDir?: string): Promise<CodeGraphPlugin>;
  registerPlugin(plugin: CodeGraphPlugin): void;
  getPlugins(type?: PluginType): CodeGraphPlugin[];
  initializeAll(context: PluginContext): Promise<void>;
  attachResolvers(): void;
}

export class DefaultPluginRegistry implements PluginRegistry {
  private plugins = new Map<string, CodeGraphPlugin>();

  async loadPlugin(packageName: string, fromDir?: string): Promise<CodeGraphPlugin> {
    const requireFrom = createRequire(
      path.join(fromDir ?? process.cwd(), '_codegraph_plugin_loader.js')
    );
    let mod: unknown;
    try {
      mod = requireFrom(packageName);
    } catch (error) {
      throw new Error(
        `Failed to load plugin ${packageName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const candidate =
      (mod as { default?: unknown; plugin?: unknown }).default ??
      (mod as { plugin?: unknown }).plugin ??
      mod;
    if (!isCodeGraphPlugin(candidate)) {
      throw new Error(`Invalid plugin format in ${packageName}`);
    }
    candidate.validate?.();
    return candidate;
  }

  registerPlugin(plugin: CodeGraphPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logWarn(`Overwriting existing plugin: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  getPlugins(type?: PluginType): CodeGraphPlugin[] {
    const all = Array.from(this.plugins.values());
    return type ? all.filter((p) => p.type === type) : all;
  }

  async initializeAll(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.initialize?.(context);
      } catch (error) {
        throw new Error(
          `Failed to initialize plugin ${plugin.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  attachResolvers(): void {
    for (const plugin of this.getPlugins('framework-resolver')) {
      for (const resolver of plugin.resolvers ?? []) {
        registerFrameworkResolver(resolver);
        logDebug(`Registered framework resolver '${resolver.name}' from plugin ${plugin.id}`);
      }
    }
  }
}

let activeRegistry: DefaultPluginRegistry | null = null;

export function getPluginRegistry(): DefaultPluginRegistry {
  if (!activeRegistry) {
    activeRegistry = new DefaultPluginRegistry();
  }
  return activeRegistry;
}

export function resetPluginRegistryForTests(): void {
  activeRegistry = null;
}
