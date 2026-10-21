import { Module } from '@nestjs/common';

import { IngredientsController } from './ingredients.controller.js';
import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { MenuItemInventoryController } from './menu-item-inventory.controller.js';
import { OrganizationInventoryController } from './organization-inventory.controller.js';
import { RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';
import { SuppliersController } from './suppliers.controller.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  controllers: [
    OrganizationInventoryController,
    IngredientsController,
    MenuItemInventoryController,
    RecipesController,
    SuppliersController,
  ],
  providers: [
    IngredientsService,
    InventoryTransactionsService,
    RecipesService,
    SuppliersService,
  ],
  exports: [InventoryTransactionsService, RecipesService],
})
export class InventoryModule {}
