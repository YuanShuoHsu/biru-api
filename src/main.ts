import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { I18nValidationPipe } from 'nestjs-i18n';
import { join } from 'node:path';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { trustedProxies } from './common/trusted-proxy.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.setBaseViewsDir(join(import.meta.dirname, '..', 'views'));
  app.setViewEngine('hbs');

  app.set('trust proxy', trustedProxies());

  app.use(cookieParser());
  app.use(helmet());

  app.enableCors({
    credentials: true,
    origin: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
  });

  app.useGlobalPipes(
    new I18nValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  app.setGlobalPrefix('api');

  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(adapterHost));

  if (process.env.NODE_ENV !== 'production') {
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
  }

  // Render 重新部署時送 SIGTERM；不啟用則 onModuleDestroy 不會執行，量化引擎的租約要等過期才會交接
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}

await bootstrap();
