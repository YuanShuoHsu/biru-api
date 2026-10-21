import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

import { DineInTablesController } from './dine-in-tables.controller.js';
import { MenuItemSalesController } from './menu-item-sales.controller.js';
import { MenuItemSalesService } from './menu-item-sales.service.js';
import { OrderModesController } from './order-modes.controller.js';
import { OrderPricingModule } from './order-pricing.module.js';
import { OrderStatsController } from './order-stats.controller.js';
import { OrderStatsService } from './order-stats.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { UserOrdersController } from './user-orders.controller.js';

@Module({
  imports: [CouponsModule, InventoryModule, OrderPricingModule],
  controllers: [
    DineInTablesController,
    MenuItemSalesController,
    OrderModesController,
    OrderStatsController,
    OrdersController,
    UserOrdersController,
  ],
  providers: [MenuItemSalesService, OrderStatsService, OrdersService],
  exports: [MenuItemSalesService, OrdersService],
})
export class OrdersModule {}
