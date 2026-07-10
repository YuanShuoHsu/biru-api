import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';

import { OrderPricingModule } from './order-pricing.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UserOrdersController } from './user-orders.controller';

@Module({
  imports: [CouponsModule, OrderPricingModule],
  controllers: [OrdersController, UserOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
