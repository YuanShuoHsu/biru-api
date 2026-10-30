import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { AdminAuditController } from './audit/admin-audit.controller.js';
import { AuditController } from './audit/audit.controller.js';
import { AdminBannersController } from './banners/admin-banners.controller.js';
import { DeletedRecordsController } from './deleted-records/deleted-records.controller.js';
import { OrganizationDeletedRecordsController } from './deleted-records/organization-deleted-records.controller.js';
import { IngredientsController } from './inventory/ingredients.controller.js';
import { OrganizationInventoryController } from './inventory/organization-inventory.controller.js';
import { RecipesController } from './inventory/recipes.controller.js';
import { MenusController } from './menus/menus.controller.js';
import { OrdersController } from './orders/orders.controller.js';
import { QuantBotsController } from './quant/bots/quant-bots.controller.js';
import { AdminStorePhotosController } from './store-photos/admin-store-photos.controller.js';
import { WaitlistController } from './waitlist/waitlist.controller.js';

const LIST_ENDPOINTS: [string, string, string][] = [
  ['/audit-logs', 'AuditLogListResponseDto', 'AuditLogResponseDto'],
  [
    '/organizations/{organizationSlug}/audit-logs',
    'AuditLogListResponseDto',
    'AuditLogResponseDto',
  ],
  ['/banners', 'BannerListResponseDto', 'BannerResponseDto'],
  [
    '/deleted-records',
    'DeletedRecordBatchListResponseDto',
    'DeletedRecordBatchResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/deleted-records',
    'DeletedRecordBatchListResponseDto',
    'DeletedRecordBatchResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/ingredients',
    'IngredientListResponseDto',
    'IngredientResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/suppliers',
    'SupplierListResponseDto',
    'SupplierResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/recipes',
    'RecipeListResponseDto',
    'RecipeResponseDto',
  ],
  [
    '/ingredients/{ingredientId}/inventory-transactions',
    'InventoryTransactionListResponseDto',
    'InventoryTransactionResponseDto',
  ],
  [
    '/recipes/{recipeId}/recipe-ingredients',
    'RecipeIngredientListResponseDto',
    'RecipeIngredientResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/orders',
    'AdminOrderListResponseDto',
    'AdminOrderResponseDto',
  ],
  [
    '/menus/{menuId}/menu-sections',
    'MenuSectionListResponseDto',
    'MenuSectionResponseDto',
  ],
  [
    '/menu-sections/{sectionId}/menu-items',
    'MenuItemListResponseDto',
    'MenuItemResponseDto',
  ],
  [
    '/menu-items/{menuItemId}/add-ons',
    'MenuItemAddOnListResponseDto',
    'MenuItemAddOnResponseDto',
  ],
  [
    '/menus/{menuId}/modifier-groups',
    'ModifierGroupListResponseDto',
    'ModifierGroupResponseDto',
  ],
  [
    '/modifier-groups/{groupId}/modifiers',
    'ModifierListResponseDto',
    'ModifierResponseDto',
  ],
  [
    '/menu-items/{menuItemId}/modifier-groups',
    'MenuItemModifierGroupListResponseDto',
    'MenuItemModifierGroupResponseDto',
  ],
  [
    '/organizations/{organizationSlug}/waitlist/tickets/list',
    'WaitlistTicketListResponseDto',
    'WaitlistTicketListItemDto',
  ],
  ['/quant/bots', 'QuantBotListResponseDto', 'QuantBotDto'],
  [
    '/quant/bots/{id}/orders',
    'QuantBotOrderListResponseDto',
    'QuantBotOrderDto',
  ],
  ['/quant/bots/{id}/fills', 'QuantBotFillListResponseDto', 'QuantBotFillDto'],
  [
    '/quant/bots/{id}/events',
    'QuantBotEventListResponseDto',
    'QuantBotEventDto',
  ],
  ['/store-photos', 'StorePhotoListResponseDto', 'StorePhotoResponseDto'],
];

describe('list endpoints OpenAPI', () => {
  let document: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AdminAuditController,
        AuditController,
        AdminBannersController,
        DeletedRecordsController,
        OrganizationDeletedRecordsController,
        IngredientsController,
        OrganizationInventoryController,
        RecipesController,
        MenusController,
        OrdersController,
        QuantBotsController,
        AdminStorePhotosController,
        WaitlistController,
      ],
    })
      .useMocker(() => ({}))
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.close();
  });

  it.each(LIST_ENDPOINTS)(
    'GET %s returns %s of %s',
    (path, listDto, itemDto) => {
      expect(document.paths[path].get?.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${listDto}` },
          },
        },
      });
      expect(document.components?.schemas?.[listDto]).toMatchObject({
        properties: {
          data: {
            type: 'array',
            items: { $ref: `#/components/schemas/${itemDto}` },
          },
          total: { type: 'number' },
        },
        required: ['data', 'total'],
      });
    },
  );
});
