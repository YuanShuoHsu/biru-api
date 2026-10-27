import { Module } from '@nestjs/common';

import { MailsModule } from '../mails/mails.module.js';

import { IngredientsController } from './ingredients.controller.js';
import { IngredientsService } from './ingredients.service.js';
import { InventoryNotificationsService } from './inventory-notifications.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { MenuStockService } from './menu-stock.service.js';
import { MenuItemInventoryController } from './menu-item-inventory.controller.js';
import { OrganizationInventoryController } from './organization-inventory.controller.js';
import { RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';
import { SuppliersController } from './suppliers.controller.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  imports: [MailsModule],
  controllers: [
    OrganizationInventoryController,
    IngredientsController,
    MenuItemInventoryController,
    RecipesController,
    SuppliersController,
  ],
  providers: [
    IngredientsService,
    InventoryNotificationsService,
    InventoryTransactionsService,
    MenuStockService,
    RecipesService,
    SuppliersService,
  ],
  exports: [
    InventoryNotificationsService,
    InventoryTransactionsService,
    MenuStockService,
    RecipesService,
  ],
})
export class InventoryModule {}
