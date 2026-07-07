import { Module } from '@nestjs/common';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UserOrdersController } from './user-orders.controller';

@Module({
  controllers: [OrdersController, UserOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
