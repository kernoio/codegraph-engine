/**
 * Rails framework resolver (Kerno in-repo plugin).
 *
 * Replaces stock `rails` (same resolver name) so parse workers pick this up.
 * Route extraction lives in `./routes` — `only:`/`except:` percent literals,
 * `path:`, `#{interpolation}` bound to a literal list, and `scope` /
 * `namespace` prefix composition (BE-3279).
 */

import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
} from '../../resolution/types';
import { extractRailsRoutes, isRoutesFile } from './routes';

export const railsResolver: FrameworkResolver = {
  name: 'rails',
  languages: ['ruby'],

  // `controller#action` route refs name no declared symbol, so resolveOne's
  // pre-filter would drop them before resolve() runs. Claim them (like the django
  // `_iterable_class` hook) so they reach Pattern 0.
  claimsReference(name: string): boolean {
    return /^[\w/]+#\w+$/.test(name);
  },

  detect(context: ResolutionContext): boolean {
    const gemfile = context.readFile('Gemfile');
    if (gemfile && gemfile.includes("'rails'")) return true;
    if (context.fileExists('config/application.rb')) return true;
    return (
      context.fileExists('app/controllers/application_controller.rb') ||
      context.fileExists('config/routes.rb')
    );
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const ca = ref.referenceName.match(/^([\w/]+)#(\w+)$/);
    if (ca) {
      const result = resolveControllerAction(ca[1]!, ca[2]!, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
      }
      return null;
    }

    if (/^[A-Z][a-zA-Z]+$/.test(ref.referenceName)) {
      const result = resolveModel(ref.referenceName, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    if (ref.referenceName.endsWith('Controller')) {
      const result = resolveController(ref.referenceName, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.85, resolvedBy: 'framework' };
      }
    }

    if (ref.referenceName.endsWith('Helper')) {
      const result = resolveHelper(ref.referenceName, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    if (ref.referenceName.endsWith('Service') || ref.referenceName.endsWith('Job')) {
      const result = resolveService(ref.referenceName, context);
      if (result) {
        return { original: ref, targetNodeId: result, confidence: 0.8, resolvedBy: 'framework' };
      }
    }

    return null;
  },

  extract(filePath, content) {
    if (!filePath.endsWith('.rb')) return { nodes: [], references: [] };
    return extractRailsRoutes(filePath, content, { routesFile: isRoutesFile(filePath) });
  },
};

/** snake_case → CamelCase (`user_profiles` → `UserProfiles`). */
function camelize(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Resolve a `controller#action` route ref to the action method in that controller. */
function resolveControllerAction(ctrlPath: string, action: string, context: ResolutionContext): string | null {
  const direct = `app/controllers/${ctrlPath}_controller.rb`;
  if (context.fileExists(direct)) {
    const m = context.getNodesInFile(direct).find((n) => (n.kind === 'method' || n.kind === 'function') && n.name === action);
    if (m) return m.id;
  }
  const cls = camelize(ctrlPath.split('/').pop()!) + 'Controller';
  for (const ctrl of context.getNodesByName(cls).filter((n) => n.kind === 'class')) {
    const m = context.getNodesInFile(ctrl.filePath).find((n) => (n.kind === 'method' || n.kind === 'function') && n.name === action);
    if (m) return m.id;
  }
  return null;
}

function resolveModel(name: string, context: ResolutionContext): string | null {
  const snakeName = name.replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
  const possiblePaths = [
    `app/models/${snakeName}.rb`,
    `app/models/concerns/${snakeName}.rb`,
  ];

  for (const modelPath of possiblePaths) {
    if (context.fileExists(modelPath)) {
      const nodes = context.getNodesInFile(modelPath);
      const modelNode = nodes.find((n) => n.kind === 'class' && n.name === name);
      if (modelNode) return modelNode.id;
    }
  }

  const candidates = context.getNodesByName(name);
  const modelNode = candidates.find((n) => n.kind === 'class' && n.filePath.includes('app/models/'));
  if (modelNode) return modelNode.id;
  return null;
}

function resolveController(name: string, context: ResolutionContext): string | null {
  const snakeName = name.replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
  const possiblePaths = [
    `app/controllers/${snakeName}.rb`,
    `app/controllers/api/${snakeName}.rb`,
    `app/controllers/api/v1/${snakeName}.rb`,
  ];

  for (const controllerPath of possiblePaths) {
    if (context.fileExists(controllerPath)) {
      const nodes = context.getNodesInFile(controllerPath);
      const controllerNode = nodes.find((n) => n.kind === 'class' && n.name === name);
      if (controllerNode) return controllerNode.id;
    }
  }

  const candidates = context.getNodesByName(name);
  const controllerNode = candidates.find((n) => n.kind === 'class' && n.filePath.includes('controllers/'));
  if (controllerNode) return controllerNode.id;
  return null;
}

function resolveHelper(name: string, context: ResolutionContext): string | null {
  const snakeName = name.replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
  const helperPath = `app/helpers/${snakeName}.rb`;
  if (context.fileExists(helperPath)) {
    const nodes = context.getNodesInFile(helperPath);
    const helperNode = nodes.find((n) => n.kind === 'module' && n.name === name);
    if (helperNode) return helperNode.id;
  }
  return null;
}

function resolveService(name: string, context: ResolutionContext): string | null {
  const snakeName = name.replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
  const possiblePaths = [
    `app/services/${snakeName}.rb`,
    `app/jobs/${snakeName}.rb`,
    `app/workers/${snakeName}.rb`,
  ];

  for (const servicePath of possiblePaths) {
    if (context.fileExists(servicePath)) {
      const nodes = context.getNodesInFile(servicePath);
      const serviceNode = nodes.find((n) => n.kind === 'class' && n.name === name);
      if (serviceNode) return serviceNode.id;
    }
  }
  return null;
}
