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
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { UpdateIngredientDto } from './dto/create-ingredient.dto.js';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto.js';
import { IngredientResponseDto } from './dto/ingredient-response.dto.js';
import { InventoryTransactionPaginationQueryDto } from './dto/inventory-transaction-pagination-query.dto.js';
import {
  InventoryTransactionListResponseDto,
  InventoryTransactionResponseDto,
} from './dto/inventory-transaction-response.dto.js';
import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { MenuStockInterceptor } from './menu-stock.interceptor.js';

@ApiTags('inventory')
@UseInterceptors(MenuStockInterceptor)
@Controller('ingredients/:ingredientId')
export class IngredientsController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
  ) {}

  @Get()
  @Roles({ inventory: ['read'] }, 'ingredientId')
  @ApiOperation({ summary: '取得食材' })
  findOne(
    @Param('ingredientId') ingredientId: string,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.findOne(ingredientId, canReadPurchasing);
  }

  @Patch()
  @Roles({ inventory: ['update'] }, 'ingredientId')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '更新食材' })
  update(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.update(ingredientId, dto);
  }

  @Delete()
  @Roles({ inventory: ['delete'] }, 'ingredientId')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '刪除食材' })
  remove(@Param('ingredientId') ingredientId: string): Promise<void> {
    return this.ingredientsService.remove(ingredientId);
  }

  @Get('inventory-transactions')
  @Roles({ inventoryTransaction: ['read'] }, 'ingredientId')
  @ApiOperation({ summary: '查詢食材庫存異動' })
  @ApiOkResponse({ type: InventoryTransactionListResponseDto })
  findAllTransactions(
    @Param('ingredientId') ingredientId: string,
    @Query() query: InventoryTransactionPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<InventoryTransactionListResponseDto> {
    return this.inventoryTransactionsService.findAll(
      ingredientId,
      query,
      canReadPurchasing,
    );
  }

  @Post('inventory-transactions')
  @Roles({ inventoryTransaction: ['create'] }, 'ingredientId')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '登記食材庫存異動' })
  createTransaction(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateInventoryTransactionDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<InventoryTransactionResponseDto> {
    return this.inventoryTransactionsService.create(ingredientId, dto, {
      canReadPurchasing,
    });
  }
}
