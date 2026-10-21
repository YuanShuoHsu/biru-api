import { Module } from '@nestjs/common';

import { MailsModule } from '../mails/mails.module.js';

import { WaitlistNotificationsService } from './waitlist-notifications.service.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [MailsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistNotificationsService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
