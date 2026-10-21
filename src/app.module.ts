import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
  I18nService,
  QueryResolver,
} from 'nestjs-i18n';
import { join } from 'node:path';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuditModule } from './audit/audit.module.js';
import { createAuth } from './auth/index.js';
import { AuthModule } from './auth/auth.module.js';
import { runWithAuthHookState } from './auth/hooks.js';
import { createAuthI18n } from './auth/i18n.js';
import { BannersModule } from './banners/banners.module.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { CouponsModule } from './coupons/coupons.module.js';
import { DonateCodesModule } from './donate-codes/donate-codes.module.js';
import { DeletedRecordsModule } from './deleted-records/deleted-records.module.js';
import { DrizzleModule } from './drizzle/drizzle.module.js';
import { EcpayModule } from './ecpay/ecpay.module.js';
import { EventsModule } from './events/events.module.js';
import { GcisModule } from './gcis/gcis.module.js';
import type { I18nTranslations } from './generated/i18n.generated.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { MailsModule } from './mails/mails.module.js';
import { MailsService } from './mails/mails.service.js';
import { RolesGuard } from './menus/guards/roles.guard.js';
import { MenusModule } from './menus/menus.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { PointsModule } from './points/points.module.js';
import { QuantModule } from './quant/quant.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';
import { WaitlistModule } from './waitlist/waitlist.module.js';

@Module({
  imports: [
    AttendanceModule,
    AuditModule,
    AuthModule,
    BannersModule,
    BetterAuthModule.forRootAsync({
      imports: [MailsModule],
      inject: [MailsService, I18nService],
      useFactory: (
        mailsService: MailsService,
        i18nService: I18nService<I18nTranslations>,
      ) => ({
        auth: createAuth(mailsService, createAuthI18n(i18nService)),
        bodyParser: { json: { limit: '2mb' } },
        middleware: (_req, _res, next) => runWithAuthHookState(next),
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
    DeletedRecordsModule,
    DonateCodesModule,
    DrizzleModule,
    EcpayModule,
    EventEmitterModule.forRoot(),
    EventsModule,
    GcisModule,
    I18nModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        fallbackLanguage: configService.getOrThrow('FALLBACK_LANGUAGE'),
        loaderOptions: {
          path: join(import.meta.dirname, '/i18n/'),
          watch: true,
        },
        typesOutputPath: join(
          import.meta.dirname,
          '../src/generated/i18n.generated.ts',
        ),
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
      inject: [ConfigService],
    }),
    InventoryModule,
    MailsModule,
    MenusModule,
    OrdersModule,
    OrganizationsModule,
    PayrollModule,
    PointsModule,
    QuantModule,
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
    WaitlistModule,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
