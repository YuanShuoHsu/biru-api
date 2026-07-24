import { Module } from '@nestjs/common';

import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

import { MenusModule } from 'src/menus/menus.module';
import { OrdersModule } from 'src/orders/orders.module';

@Module({
  imports: [MenusModule, OrdersModule],
  providers: [EventsGateway, EventsService],
})
export class EventsModule {}
