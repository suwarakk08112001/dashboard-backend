// import * as dotenv from 'dotenv';
// dotenv.config(); // <--- บรรทัดนี้ต้องอยู่บนสุด ห้ามย้าย!

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   app.setGlobalPrefix('dashboard-google-sheets/api/v1');

//   app.enableCors({
//     origin: process.env.frontend, // ← เปลี่ยนเป็น port ของ Quasar dev server
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
//     credentials: true,
//   });

//   await app.listen(Number(process.env.PORT));

// }

// bootstrap().catch((err) => {
//   console.error(err);
// });

import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { IncomingMessage, ServerResponse } from 'http';
import { INestApplication } from '@nestjs/common';
import express from 'express';

const server = express();

const createNestServer = async (expressInstance: express.Express) => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  app.setGlobalPrefix('dashboard-google-sheets/api/v1');

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.init(); // ← ใช้ init() ไม่ใช่ listen()
  return app;
};

// cache instance ไว้ reuse ระหว่าง invocations
let cachedApp: INestApplication | null = null;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (!cachedApp) {
    cachedApp = await createNestServer(server);
  }
  server(req, res);
}
