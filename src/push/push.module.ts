import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module.js';
import { WaitlistModule } from '../waitlist/waitlist.module.js';

import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  imports: [OrdersModule, WaitlistModule],
  controllers: [PushController],
  providers: [PushService],
})
export class PushModule {}
