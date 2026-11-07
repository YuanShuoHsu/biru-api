import { Logger } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { I18nValidationPipe } from 'nestjs-i18n';
import { join } from 'node:path';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { rateLimitEnabled, trustedProxies } from './common/trusted-proxy.js';
import { fieldEncryptionKeys } from './common/utils/field-encryption.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));

  app.set('trust proxy', trustedProxies());

  if (!fieldEncryptionKeys())
    new Logger('FieldEncryption').warn(
      'FIELD_ENCRYPTION_KEYS 未設定，欄位加密沿用 BETTER_AUTH_SECRET 推導的金鑰',
    );

  if (process.env.NODE_ENV === 'production' && !rateLimitEnabled())
    new Logger('RateLimit').warn(
      'CLIENT_IP_HEADER 與 TRUSTED_PROXIES 都未設定：Nest 的限流全部停用，better-auth 只剩登入、註冊等內建限流，且全平台共用同一個桶',
    );

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
