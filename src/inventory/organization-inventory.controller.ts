import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from '../common/decorators/audit.decorator.js';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';

import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';
import { ReorderDto } from '../menus/dto/reorder.dto.js';

import { CreateIngredientBatchDto } from './dto/create-ingredient-batch.dto.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { CreateInventoryReceiptDto } from './dto/create-inventory-receipt.dto.js';
import { CreateProductWasteDto } from './dto/create-product-waste.dto.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { IngredientPaginationQueryDto } from './dto/ingredient-pagination-query.dto.js';
import {
  IngredientListResponseDto,
  IngredientResponseDto,
} from './dto/ingredient-response.dto.js';
import { InventoryReceiptResponseDto } from './dto/inventory-receipt-response.dto.js';
import { InventoryTransactionResponseDto } from './dto/inventory-transaction-response.dto.js';
import { RecipePaginationQueryDto } from './dto/recipe-pagination-query.dto.js';
import {
  RecipeListResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto.js';
import { SupplierPaginationQueryDto } from './dto/supplier-pagination-query.dto.js';
import {
  SupplierListResponseDto,
  SupplierResponseDto,
} from './dto/supplier-response.dto.js';
import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { MenuStockInterceptor } from './menu-stock.interceptor.js';
import { RecipesService } from './recipes.service.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('inventory')
@ApiParam({ name: 'organizationSlug', type: String })
@UseInterceptors(MenuStockInterceptor)
@Controller('organizations/:organizationSlug')
export class OrganizationInventoryController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly recipesService: RecipesService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Get('ingredients')
  @Roles({ inventory: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢食材列表' })
  @ApiOkResponse({ type: IngredientListResponseDto })
  findAllIngredients(
    @OrganizationId() organizationId: string,
    @Query() query: IngredientPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<IngredientListResponseDto> {
    return this.ingredientsService.findAll(
      organizationId,
      query,
      canReadPurchasing,
    );
  }

  @Post('ingredients')
  @Roles({ inventory: ['create'] }, 'organizationSlug')
  @Audit('ingredient', { response: true })
  @ApiOperation({ summary: '建立食材' })
  createIngredient(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateIngredientDto,
    @Session() session: UserSession,
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.create(organizationId, dto, session.user.id);
  }

  @Post('ingredients/:ingredientId/batches')
  @Roles({ inventoryTransaction: ['create'] }, 'organizationSlug')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '依來源食譜製作一批食材' })
  createIngredientBatch(
    @OrganizationId() organizationId: string,
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateIngredientBatchDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @Session() session: UserSession,
  ): Promise<InventoryTransactionResponseDto> {
    return this.inventoryTransactionsService.produceBatch(
      organizationId,
      ingredientId,
      dto,
      canReadPurchasing,
      session.user.id,
    );
  }

  @Post('inventory/waste')
  @Roles({ inventoryTransaction: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '依食譜登記成品報廢' })
  createProductWaste(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateProductWasteDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @Session() session: UserSession,
  ): Promise<InventoryTransactionResponseDto[]> {
    return this.inventoryTransactionsService.wasteProduct(
      organizationId,
      dto,
      canReadPurchasing,
      session.user.id,
    );
  }

  @Post('inventory/receipts')
  @Roles({ inventoryTransaction: ['create'] }, 'organizationSlug')
  @ApiHeader({
    description: '同一張進貨單重試請帶同一把鍵，重送會回傳既有進貨單',
    name: 'Idempotency-Key',
    required: false,
  })
  @ApiOperation({ summary: '點收一張進貨單' })
  createInventoryReceipt(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateInventoryReceiptDto,
    @IdempotencyKey() idempotencyKey: string | null,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @Session() session: UserSession,
  ): Promise<InventoryReceiptResponseDto> {
    return this.inventoryTransactionsService.receive(
      organizationId,
      dto,
      idempotencyKey,
      canReadPurchasing,
      session.user.id,
    );
  }

  @Patch('ingredients/reorder')
  @Roles({ inventory: ['update'] }, 'organizationSlug')
  @Audit('ingredient', { body: 'ids' })
  @ApiOperation({ summary: '重新排序食材' })
  reorderIngredients(
    @OrganizationId() organizationId: string,
    @Body() { ids }: ReorderDto,
  ): Promise<void> {
    return this.ingredientsService.reorder(organizationId, ids);
  }

  @Delete('ingredients')
  @Roles({ inventory: ['delete'] }, 'organizationSlug')
  @Audit('ingredient', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除食材' })
  removeIngredients(
    @OrganizationId() organizationId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.ingredientsService.removeMany(organizationId, ids);
  }

  @Get('suppliers')
  @Roles({ purchasing: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢供應商列表' })
  @ApiOkResponse({ type: SupplierListResponseDto })
  findAllSuppliers(
    @OrganizationId() organizationId: string,
    @Query() query: SupplierPaginationQueryDto,
  ): Promise<SupplierListResponseDto> {
    return this.suppliersService.findAll(organizationId, query);
  }

  @Delete('suppliers')
  @Roles({ purchasing: ['delete'] }, 'organizationSlug')
  @Audit('supplier', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除供應商' })
  removeSuppliers(
    @OrganizationId() organizationId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.suppliersService.removeMany(organizationId, ids);
  }

  @Post('suppliers')
  @Roles({ purchasing: ['create'] }, 'organizationSlug')
  @Audit(
    { resource: 'supplier', idSource: { response: true } },
    {
      resource: 'ingredient',
      idSource: [
        { body: 'ingredientIds' },
        { column: 'supplierId', response: true },
      ],
    },
  )
  @ApiOperation({ summary: '建立供應商' })
  createSupplier(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.suppliersService.create(organizationId, dto);
  }

  @Get('recipes')
  @Roles({ inventory: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢食譜列表' })
  @ApiOkResponse({ type: RecipeListResponseDto })
  findAllRecipes(
    @OrganizationId() organizationId: string,
    @Query() query: RecipePaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<RecipeListResponseDto> {
    return this.recipesService.findAll(
      organizationId,
      query,
      canReadPurchasing,
    );
  }

  @Post('recipes')
  @Roles({ inventory: ['create'] }, 'organizationSlug')
  @Audit('recipe', { response: true })
  @ApiOperation({ summary: '建立食譜' })
  createRecipe(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.create(organizationId, dto);
  }
}
