import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.NEXT_URL,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .addGlobalResponse({
      status: 500,
      description: 'Internal server error',
    })
    .setTitle('Biru Coffee NestJS Swagger')
    .setDescription('Biru Coffee API')
    .setVersion('1.0')
    // .addTag('cats')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
