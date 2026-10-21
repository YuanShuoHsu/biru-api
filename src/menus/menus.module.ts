import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';

import { PublicMenusController } from './menus-public.controller.js';
import { PublicMenusService } from './menus-public.service.js';
import { MenusController } from './menus.controller.js';
import { MenusService } from './menus.service.js';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [MenusController, PublicMenusController],
  providers: [MenusService, PublicMenusService],
  exports: [MenusService, PublicMenusService],
})
export class MenusModule {}
