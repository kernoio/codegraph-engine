/**
 * Akka HTTP / Pekko HTTP Framework Resolver (Kerno in-repo plugin)
 *
 * Detects Scala projects that depend on akka-http or pekko-http and extracts
 * Routing DSL endpoints (`path` / `pathPrefix` / `get` / `post` / …).
 */

import {
  FrameworkResolver,
  UnresolvedRef,
  ResolvedRef,
  ResolutionContext,
} from '../types';
import { extractAkkaHttpRoutes } from './routes';

const METHOD_KINDS = new Set(['method', 'function']);

export const akkaHttpResolver: FrameworkResolver = {
  name: 'akka-http',
  languages: ['scala'],

  detect(context: ResolutionContext): boolean {
    const buildSbt = context.readFile('build.sbt');
    if (buildSbt && /(?:akka-http|pekko-http)/i.test(buildSbt)) return true;

    for (const file of ['build.gradle', 'build.gradle.kts', 'pom.xml']) {
      const content = context.readFile(file);
      if (content && /(?:akka-http|pekko-http)/i.test(content)) return true;
    }

    // Fallback: import / package signals in Scala sources.
    return context.getAllFiles().some((f) => {
      if (!f.endsWith('.scala')) return false;
      const content = context.readFile(f);
      if (!content) return false;
      return (
        /(?:akka|org\.apache\.pekko)\.http\.scaladsl/.test(content) &&
        /\b(?:pathPrefix|pathEnd|Directives)\b/.test(content)
      );
    });
  },

  resolve(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
    const candidates = context
      .getNodesByName(ref.referenceName)
      .filter((n) => METHOD_KINDS.has(n.kind));
    if (candidates.length === 0) return null;

    // Prefer handlers declared in the same file as the route.
    const sameFile = candidates.find((n) => n.filePath === ref.filePath);
    const target = sameFile ?? candidates[0]!;
    return {
      original: ref,
      targetNodeId: target.id,
      confidence: sameFile ? 0.85 : 0.7,
      resolvedBy: 'framework',
    };
  },

  extract(filePath, content) {
    return extractAkkaHttpRoutes(filePath, content);
  },
};
