/**
 * Django / DRF plugin — include() prefix composition (postExtract) and
 * project-base ViewSet detection. Fixtures from django-realworld and the
 * Django URL dispatcher docs.
 */

import { describe, expect, it } from 'vitest';
import { djangoResolver, joinDjango, normalizeDjangoPath } from '../../src/plugins/django/resolver';
import {
  DJANGO_NESTED_RE_PATH_INCLUDE,
  DJANGO_PROJECT_BASE_VIEWSET,
  DJANGO_REALWORLD_ARTICLES_URLS,
  DJANGO_REALWORLD_ROOT_URLS,
} from './fixtures';
import type { Node } from '../../src/types';
import type { ResolutionContext } from '../../src/resolution/types';

function ctxFor(
  files: Record<string, string>,
  routes: Node[]
): ResolutionContext {
  return {
    getAllFiles: () => Object.keys(files),
    readFile: (fp: string) => files[fp] ?? null,
    fileExists: (fp: string) => Object.prototype.hasOwnProperty.call(files, fp),
    getNodesInFile: (fp: string) => routes.filter((r) => r.filePath === fp),
    getNodesByName: () => [],
    getNodesByKind: (kind: string) => (kind === 'route' ? routes : []),
    getProjectRoot: () => '/test',
    getImportMappings: () => [],
    getNodesByQualifiedName: () => [],
    getNodesByLowerName: () => [],
  } as unknown as ResolutionContext;
}

function extractAll(files: Record<string, string>): Node[] {
  const routes: Node[] = [];
  for (const [fp, src] of Object.entries(files)) {
    routes.push(...djangoResolver.extract!(fp, src).nodes);
  }
  return routes;
}

describe('django path helpers', () => {
  it('normalizes re_path anchors and named groups', () => {
    expect(normalizeDjangoPath('^tags/?$')).toBe('tags/');
    expect(normalizeDjangoPath('^articles/(?P<article_slug>[-\\w]+)/favorite/?$')).toBe(
      'articles/{article_slug}/favorite/'
    );
  });

  it('joins include prefixes without doubling slashes', () => {
    expect(joinDjango('^api/', 'health/')).toBe('api/health/');
    expect(joinDjango('^api/', '^')).toBe('api');
    expect(joinDjango('api/', 'VIEWSET-not-used')).toBe('api/VIEWSET-not-used');
  });
});

describe('django postExtract — nested re_path include list (BE-3184)', () => {
  it('prefixes direct views inside include([ ... ])', () => {
    const filePath = 'pages/urls.py';
    const routes = djangoResolver.extract!(filePath, DJANGO_NESTED_RE_PATH_INCLUDE).nodes;
    const updates = djangoResolver.postExtract!(
      ctxFor({ [filePath]: DJANGO_NESTED_RE_PATH_INCLUDE }, routes)
    );
    const names = new Map(routes.map((r) => [r.id, r.name]));
    for (const u of updates) names.set(u.id, u.name);
    expect([...names.values()].sort()).toEqual(
      expect.arrayContaining([
        'pages/history/',
        'pages/edit/',
        'pages/discuss/',
        'pages/permissions/',
      ])
    );
    // The include() mount itself is not rewritten.
    expect([...names.values()]).toContain('^pages/');
  });
});

describe('django postExtract — include(module) + DRF router (BE-3184 / BE-3199)', () => {
  it('composes ^api/ onto realworld article views and the ViewSet', () => {
    const files = {
      'conduit/urls.py': DJANGO_REALWORLD_ROOT_URLS,
      'conduit/apps/articles/urls.py': DJANGO_REALWORLD_ARTICLES_URLS,
    };
    const routes = extractAll(files);
    const updates = djangoResolver.postExtract!(ctxFor(files, routes));
    const names = new Map(routes.map((r) => [r.id, r.name]));
    for (const u of updates) names.set(u.id, u.name);
    const listed = [...names.values()];
    expect(listed).toContain('VIEWSET /api/articles');
    expect(listed).toContain('api/tags/');
    expect(listed).toContain('api/articles/feed/');
    expect(listed.some((n) => n.includes('favorite'))).toBe(true);
  });
});

describe('django postExtract — include(router.urls) prefix (BE-3199)', () => {
  it('composes path("api/", include(router.urls)) onto UserAPI / ItemAPI', () => {
    const filePath = 'app/urls.py';
    const routes = djangoResolver.extract!(filePath, DJANGO_PROJECT_BASE_VIEWSET).nodes;
    expect(routes.map((n) => n.name)).toEqual(
      expect.arrayContaining(['VIEWSET /users', 'VIEWSET /items'])
    );
    const updates = djangoResolver.postExtract!(
      ctxFor({ [filePath]: DJANGO_PROJECT_BASE_VIEWSET }, routes)
    );
    const names = new Map(routes.map((r) => [r.id, r.name]));
    for (const u of updates) names.set(u.id, u.name);
    expect([...names.values()]).toEqual(
      expect.arrayContaining(['VIEWSET /api/users', 'VIEWSET /api/items'])
    );
  });
});

describe('django extract — project-defined ViewSet base (BE-3183)', () => {
  it('does not require a *View / *ViewSet suffix when the receiver is a router', () => {
    const src = `
from rest_framework.routers import DefaultRouter
from .views import UserAPI

router = DefaultRouter()
router.register(r'users', UserAPI)
`;
    const { nodes, references } = djangoResolver.extract!('api/urls.py', src);
    expect(nodes.map((n) => n.name)).toEqual(['VIEWSET /users']);
    expect(references.map((r) => r.referenceName)).toEqual(['UserAPI']);
  });

  it('does not treat admin.site.register(Model, Admin) as a ViewSet', () => {
    const src = `
from django.contrib import admin
from .models import Article
admin.site.register(Article, ArticleAdmin)
`;
    const { nodes } = djangoResolver.extract!('admin.py', src);
    expect(nodes.filter((n) => n.name.startsWith('VIEWSET'))).toEqual([]);
  });
});
