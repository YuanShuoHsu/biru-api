import { Module } from '@nestjs/common';

import { EventsGateway } from './events.gateway.js';
import { EventsService } from './events.service.js';

import { MenusModule } from '../menus/menus.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SharedCartsModule } from '../shared-carts/shared-carts.module.js';
import { WaitlistModule } from '../waitlist/waitlist.module.js';

@Module({
  imports: [MenusModule, OrdersModule, SharedCartsModule, WaitlistModule],
  providers: [EventsGateway, EventsService],
})
export class EventsModule {}
