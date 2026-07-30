import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';

import { MenuItemSalesController } from './menu-item-sales.controller';
import { MenuItemSalesService } from './menu-item-sales.service';
import { OrderPricingModule } from './order-pricing.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UserOrdersController } from './user-orders.controller';

@Module({
  imports: [CouponsModule, OrderPricingModule],
  controllers: [
    MenuItemSalesController,
    OrdersController,
    UserOrdersController,
  ],
  providers: [MenuItemSalesService, OrdersService],
  exports: [MenuItemSalesService, OrdersService],
})
export class OrdersModule {}
