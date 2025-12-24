import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from 'src/prisma/prisma.module';

import { MailController } from './mail.controller';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const isPreview = config.get('NODE_ENV') !== 'production';

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
            dir: __dirname + '/templates',
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
