import { Module } from '@nestjs/common';

import { MailsModule } from 'src/mails/mails.module';

import { WaitlistNotificationsService } from './waitlist-notifications.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [MailsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistNotificationsService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
