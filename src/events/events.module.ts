import { Module } from '@nestjs/common';

import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

import { MenusModule } from 'src/menus/menus.module';
import { OrdersModule } from 'src/orders/orders.module';
import { WaitlistModule } from 'src/waitlist/waitlist.module';

@Module({
  imports: [MenusModule, OrdersModule, WaitlistModule],
  providers: [EventsGateway, EventsService],
})
export class EventsModule {}
