import { Module } from '@nestjs/common';

import { OrderPricingModule } from '../orders/order-pricing.module.js';
import { OrdersModule } from '../orders/orders.module.js';

import { SharedCartsController } from './shared-carts.controller.js';
import { SharedCartsService } from './shared-carts.service.js';

@Module({
  imports: [OrderPricingModule, OrdersModule],
  controllers: [SharedCartsController],
  providers: [SharedCartsService],
  exports: [SharedCartsService],
})
export class SharedCartsModule {}
