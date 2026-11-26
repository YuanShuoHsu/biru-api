import { Module } from '@nestjs/common';

import { MailsModule } from '../mails/mails.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { NotificationsModule } from '../push/notifications.module.js';

import { WaitlistNotificationsService } from './waitlist-notifications.service.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [MailsModule, NotificationsModule, OrdersModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistNotificationsService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
