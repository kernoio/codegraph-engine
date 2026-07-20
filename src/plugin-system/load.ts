/**
 * Load built-in Kerno plugins + explicit packages from codegraph.json.
 */

import { getBuiltInPlugins } from './builtins';
import { getPluginRegistry } from './registry';
import type { PluginContext } from './api';
import { getProjectPlugins } from '../project-config';
import { logWarn, logDebug } from '../errors';
import { CodeGraphPackageVersion } from '../mcp/version';

const consoleLogger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    logDebug(message, meta ?? {}),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logWarn(message, meta ?? {}),
  error: (message: string, meta?: Record<string, unknown>) =>
    logWarn(message, meta ?? {}),
};

/**
 * Register always-on built-ins and any packages listed in codegraph.json
 * `plugins`, then attach their FrameworkResolvers into the core registry.
 */
export async function loadConfiguredPlugins(projectRoot: string): Promise<void> {
  const registry = getPluginRegistry();

  for (const plugin of getBuiltInPlugins()) {
    registry.registerPlugin(plugin);
  }

  const configured = getProjectPlugins(projectRoot);
  for (const packageName of configured) {
    try {
      const plugin = await registry.loadPlugin(packageName, projectRoot);
      registry.registerPlugin(plugin);
      logDebug(`Loaded configured plugin ${packageName} (${plugin.id})`);
    } catch (error) {
      logWarn(`Skipping plugin ${packageName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const context: PluginContext = {
    codeGraphVersion: CodeGraphPackageVersion,
    projectRoot,
    logger: consoleLogger,
    config: {},
  };
  await registry.initializeAll(context);
  registry.attachResolvers();
}
