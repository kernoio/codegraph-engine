import { Controller, Get, Post } from '@nestjs/common';

@Controller()
export class PublicController {
  @Get('robots.txt')
  robots() {}
}

@Controller('mcp')
export class McpController {
  @Post()
  handle() {}
}

@Controller('docs')
export class DocsController {
  @Get(':spaceSlug')
  page() {}
}
