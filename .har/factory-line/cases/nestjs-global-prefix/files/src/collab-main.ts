import { NestFactory } from '@nestjs/core';
import { CollabModule } from './collab.module';

async function bootstrap() {
  const app = await NestFactory.create(CollabModule);
  // Second bootstrap (docmost collab-main.ts): same prefix, no exclude list.
  // Excludes from main.ts must still apply.
  app.setGlobalPrefix('api');
  await app.listen(3001);
}

bootstrap();
