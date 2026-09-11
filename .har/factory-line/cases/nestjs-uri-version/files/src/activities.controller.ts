import { Controller, Delete, Get, Post } from '@nestjs/common';

@Controller('activities')
export class ActivitiesController {
  @Get()
  list() {}

  @Post()
  create() {}

  @Delete(':id')
  remove() {}
}
