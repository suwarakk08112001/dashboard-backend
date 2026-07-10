import * as dotenv from 'dotenv';
dotenv.config(); // <--- บรรทัดนี้ต้องอยู่บนสุด ห้ามย้าย!

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('dashboard-google-sheets/api/v1');

  app.enableCors({
    origin: process.env.frontend, // ← เปลี่ยนเป็น port ของ Quasar dev server
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(Number(process.env.PORT));
}

bootstrap().catch((err) => {
  console.error(err);
});
