import { Module } from '@nestjs/common';

import { CouponsModule } from '../coupons/coupons.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrintersModule } from '../printers/printers.module.js';

import { DineInTablesController } from './dine-in-tables.controller.js';
import { MenuItemSalesController } from './menu-item-sales.controller.js';
import { MenuItemSalesService } from './menu-item-sales.service.js';
import { OrderModesController } from './order-modes.controller.js';
import { OrderPricingModule } from './order-pricing.module.js';
import { OrderStatsController } from './order-stats.controller.js';
import { OrderStatsService } from './order-stats.service.js';
import { OrderTicketPrintersController } from './order-ticket-printers.controller.js';
import { OrderTicketService } from './order-ticket.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { UserOrdersController } from './user-orders.controller.js';

@Module({
  imports: [CouponsModule, InventoryModule, OrderPricingModule, PrintersModule],
  controllers: [
    DineInTablesController,
    MenuItemSalesController,
    OrderModesController,
    OrderStatsController,
    OrderTicketPrintersController,
    OrdersController,
    UserOrdersController,
  ],
  providers: [
    MenuItemSalesService,
    OrderStatsService,
    OrderTicketService,
    OrdersService,
  ],
  exports: [MenuItemSalesService, OrderTicketService, OrdersService],
})
export class OrdersModule {}
