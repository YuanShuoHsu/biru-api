import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from '../common/decorators/audit.decorator.js';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { CreateIngredientWasteDto } from './dto/create-ingredient-waste.dto.js';
import { UpdateIngredientDto } from './dto/create-ingredient.dto.js';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto.js';
import { IngredientResponseDto } from './dto/ingredient-response.dto.js';
import {
  InventoryTransactionExportQueryDto,
  InventoryTransactionPaginationQueryDto,
} from './dto/inventory-transaction-pagination-query.dto.js';
import {
  InventoryTransactionListResponseDto,
  InventoryTransactionResponseDto,
} from './dto/inventory-transaction-response.dto.js';
import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionCsvService } from './inventory-transaction-csv.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { MenuStockInterceptor } from './menu-stock.interceptor.js';

@ApiTags('inventory')
@UseInterceptors(MenuStockInterceptor)
@Controller('ingredients/:ingredientId')
export class IngredientsController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly inventoryTransactionCsvService: InventoryTransactionCsvService,
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
    @Session() session: UserSession,
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.update(ingredientId, dto, session.user.id);
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

  @Get('inventory-transactions/export.csv')
  @Roles({ inventoryTransaction: ['read'] }, 'ingredientId')
  @ApiOperation({ summary: '匯出食材庫存異動 CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  async exportTransactions(
    @Param('ingredientId') ingredientId: string,
    @Query() query: InventoryTransactionExportQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<StreamableFile> {
    const csv = await this.inventoryTransactionCsvService.transactions(
      ingredientId,
      query,
      canReadPurchasing,
    );

    return new StreamableFile(Buffer.from(csv), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="inventory-transactions.csv"',
    });
  }

  @Post('inventory-transactions')
  @Roles({ inventoryTransaction: ['create'] }, 'ingredientId')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '登記食材庫存異動' })
  createTransaction(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateInventoryTransactionDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @Session() session: UserSession,
  ): Promise<InventoryTransactionResponseDto> {
    return this.inventoryTransactionsService.create(ingredientId, dto, {
      canReadPurchasing,
      createdBy: session.user.id,
    });
  }

  @Post('waste')
  @Roles({ inventoryTransaction: ['create'] }, 'ingredientId')
  @Audit('ingredient', { param: 'ingredientId' })
  @ApiOperation({ summary: '登記食材報廢' })
  createWaste(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateIngredientWasteDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @Session() session: UserSession,
  ): Promise<InventoryTransactionResponseDto> {
    return this.inventoryTransactionsService.waste(
      ingredientId,
      dto,
      canReadPurchasing,
      session.user.id,
    );
  }
}
