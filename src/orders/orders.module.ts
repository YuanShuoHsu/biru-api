import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module';
import { InventoryModule } from '../inventory/inventory.module';

import { MenuItemSalesController } from './menu-item-sales.controller';
import { MenuItemSalesService } from './menu-item-sales.service';
import { OrderPricingModule } from './order-pricing.module';
import { OrderStatsController } from './order-stats.controller';
import { OrderStatsService } from './order-stats.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UserOrdersController } from './user-orders.controller';

@Module({
  imports: [CouponsModule, InventoryModule, OrderPricingModule],
  controllers: [
    MenuItemSalesController,
    OrderStatsController,
    OrdersController,
    UserOrdersController,
  ],
  providers: [MenuItemSalesService, OrderStatsService, OrdersService],
  exports: [MenuItemSalesService, OrdersService],
})
export class OrdersModule {}
