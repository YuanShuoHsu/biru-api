import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';

import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { join } from 'node:path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { createAuth } from './auth';
import { AuthModule } from './auth/auth.module';
import { CouponsModule } from './coupons/coupons.module';
import { DonateCodesModule } from './donate-codes/donate-codes.module';
import { DrizzleModule } from './drizzle/drizzle.module';
import { EcpayModule } from './ecpay/ecpay.module';
import { EventsModule } from './events/events.module';
import { GcisModule } from './gcis/gcis.module';
import { MailsModule } from './mails/mails.module';
import { MailsService } from './mails/mails.service';
import { RolesGuard } from './menus/guards/roles.guard';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AuthModule,
    BetterAuthModule.forRootAsync({
      imports: [MailsModule],
      inject: [MailsService],
      useFactory: (mailsService: MailsService) => ({
        auth: createAuth(mailsService),
      }),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          cls.set('userAgent', req.headers['user-agent']);
        },
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    CouponsModule,
    DonateCodesModule,
    DrizzleModule,
    EcpayModule,
    EventEmitterModule.forRoot(),
    EventsModule,
    GcisModule,
    I18nModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        fallbackLanguage: configService.getOrThrow('FALLBACK_LANGUAGE'),
        loaderOptions: {
          path: join(__dirname, '/i18n/'),
          watch: true,
        },
        typesOutputPath: join(__dirname, '../src/generated/i18n.generated.ts'),
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
      inject: [ConfigService],
    }),
    MailsModule,
    MenusModule,
    OrdersModule,
    OrganizationsModule,
    ScheduleModule.forRoot(),
    TasksModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
