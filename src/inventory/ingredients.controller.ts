import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from 'src/common/decorators/audit.decorator';

import { HasPermission } from 'src/menus/decorators/permission.decorator';
import { Roles } from 'src/menus/decorators/roles.decorator';

import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { UpdateIngredientDto } from './dto/create-ingredient.dto';
import { IngredientResponseDto } from './dto/ingredient-response.dto';
import { InventoryTransactionPaginationQueryDto } from './dto/inventory-transaction-pagination-query.dto';
import { InventoryTransactionResponseDto } from './dto/inventory-transaction-response.dto';
import { IngredientsService } from './ingredients.service';
import { InventoryTransactionsService } from './inventory-transactions.service';

@ApiTags('inventory')
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
  findAllTransactions(
    @Param('ingredientId') ingredientId: string,
    @Query() query: InventoryTransactionPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<{ data: InventoryTransactionResponseDto[]; total: number }> {
    return this.inventoryTransactionsService.findAll(
      ingredientId,
      query,
      canReadPurchasing,
    );
  }

  @Post('inventory-transactions')
  @Roles({ inventoryTransaction: ['create'] }, 'ingredientId')
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
