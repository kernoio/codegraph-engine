import { Controller, Get } from '@nestjs/common';

@Controller()
export class AttachmentController {
  @Get('attachments/:id')
  get() {}
}
