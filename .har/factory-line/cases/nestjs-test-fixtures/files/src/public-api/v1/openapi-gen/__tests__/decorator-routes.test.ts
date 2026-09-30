import { Controller, Get, Post } from '@nestjs/common';

/** Fixture controllers — the running server never mounts these. */
@Controller('fixtures')
export class DecoratorRoutesController {
  @Get()
  list() {}

  @Post('items')
  create() {}

  @Get('items/:id')
  one() {}
}
