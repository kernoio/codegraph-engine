// Kerno CodeGraph fixtures — tsoa + Next App Router route handlers

import { describe, expect, it } from 'vitest';
import { tsoaResolver } from '../src/resolution/frameworks/tsoa';
import { reactResolver } from '../src/resolution/frameworks/react';

describe('tsoa resolver', () => {
  it('extracts @Route + @Get/@Post paths', () => {
    const content = `
import { Controller, Get, Post, Route } from 'tsoa';

@Route('api/v1/users')
export class UsersController {
  @Get()
  public async list(): Promise<void> {}

  @Get('{userId}')
  public async get(userId: string): Promise<void> {}

  @Post()
  public async create(): Promise<void> {}
}
`;
    const result = tsoaResolver.extract!('src/UsersController.ts', content);
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual([
      'GET /api/v1/users',
      'GET /api/v1/users/{userId}',
      'POST /api/v1/users',
    ]);
  });
});

describe('Next App Router route.ts', () => {
  it('extracts named HTTP exports from route handlers', () => {
    const content = `
export async function GET() { return Response.json({}); }
export async function POST() { return Response.json({}); }
`;
    const result = reactResolver.extract!(
      'apps/web/app/api/feedback/route.ts',
      content
    );
    const names = result.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['GET /api/feedback', 'POST /api/feedback']);
  });
});
