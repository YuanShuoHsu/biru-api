import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { I18nService } from 'nestjs-i18n';
import { join } from 'node:path';
import { VerificationsModule } from 'src/verifications/verifications.module';

import { MailsController } from './mails.controller';
import { MailsService } from './mails.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, I18nService],
      useFactory: (config: ConfigService, i18n: I18nService) => {
        const isPreview = config.get('MAIL_PREVIEW') === 'true';

        return {
          transport: isPreview
            ? {
                jsonTransport: true,
              }
            : {
                host: config.get('MAIL_HOST'),
                port: 587,
                secure: false,
                auth: {
                  user: config.get('MAIL_USER'),
                  pass: config.get('MAIL_PASS'),
                },
              },
          defaults: {
            from: `"Biru Coffee" <${config.get('MAIL_USER')}>`,
          },
          preview: isPreview,
          template: {
            dir: join(process.cwd(), 'views', 'mail'),
            adapter: new HandlebarsAdapter({
              t: i18n.hbsHelper,
            }),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
    VerificationsModule,
  ],
  controllers: [MailsController],
  providers: [MailsService],
  exports: [MailsService],
})
export class MailsModule {}
