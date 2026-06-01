import { Module } from '@nestjs/common';

import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

import { MenusModule } from 'src/menus/menus.module';

@Module({
  imports: [MenusModule],
  providers: [EventsGateway, EventsService],
})
export class EventsModule {}
