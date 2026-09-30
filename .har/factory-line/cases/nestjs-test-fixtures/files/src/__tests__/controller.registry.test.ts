import { Controller, Get } from '@nestjs/common';

@Controller('registry-only')
export class RegistryController {
  @Get()
  list() {}
}
