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

import { Roles } from 'src/menus/decorators/roles.decorator';

import {
  CreateIngredientOfferDto,
  UpdateIngredientOfferDto,
} from './dto/create-ingredient-offer.dto';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { UpdateIngredientDto } from './dto/create-ingredient.dto';
import {
  IngredientOfferResponseDto,
  IngredientResponseDto,
} from './dto/ingredient-response.dto';
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
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.findOne(ingredientId);
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

  @Get('offers')
  @Roles({ inventory: ['read'] }, 'ingredientId')
  @ApiOperation({ summary: '查詢食材採購規格' })
  findAllOffers(
    @Param('ingredientId') ingredientId: string,
  ): Promise<IngredientOfferResponseDto[]> {
    return this.ingredientsService.findAllOffers(ingredientId);
  }

  @Post('offers')
  @Roles({ inventory: ['create'] }, 'ingredientId')
  @Audit({
    resource: 'ingredient',
    idSource: { column: 'ingredientId', param: 'ingredientId' },
    via: { table: 'ingredientOffer', ownerColumn: 'ingredientId' },
  })
  @ApiOperation({ summary: '建立食材採購規格' })
  createOffer(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateIngredientOfferDto,
  ): Promise<IngredientOfferResponseDto> {
    return this.ingredientsService.createOffer(ingredientId, dto);
  }

  @Patch('offers/:ingredientOfferId')
  @Roles({ inventory: ['update'] }, 'ingredientId')
  @Audit({
    resource: 'ingredient',
    idSource: { param: 'ingredientOfferId' },
    via: { table: 'ingredientOffer', ownerColumn: 'ingredientId' },
  })
  @ApiOperation({ summary: '更新食材採購規格' })
  updateOffer(
    @Param('ingredientOfferId') ingredientOfferId: string,
    @Body() dto: UpdateIngredientOfferDto,
  ): Promise<IngredientOfferResponseDto> {
    return this.ingredientsService.updateOffer(ingredientOfferId, dto);
  }

  @Delete('offers/:ingredientOfferId')
  @Roles({ inventory: ['delete'] }, 'ingredientId')
  @Audit({
    resource: 'ingredient',
    idSource: { param: 'ingredientOfferId' },
    via: { table: 'ingredientOffer', ownerColumn: 'ingredientId' },
  })
  @ApiOperation({ summary: '刪除食材採購規格' })
  removeOffer(
    @Param('ingredientOfferId') ingredientOfferId: string,
  ): Promise<void> {
    return this.ingredientsService.removeOffer(ingredientOfferId);
  }

  @Get('inventory-transactions')
  @Roles({ inventoryTransaction: ['read'] }, 'ingredientId')
  @ApiOperation({ summary: '查詢食材庫存異動' })
  findAllTransactions(
    @Param('ingredientId') ingredientId: string,
    @Query() query: InventoryTransactionPaginationQueryDto,
  ): Promise<{ data: InventoryTransactionResponseDto[]; total: number }> {
    return this.inventoryTransactionsService.findAll(ingredientId, query);
  }

  @Post('inventory-transactions')
  @Roles({ inventoryTransaction: ['create'] }, 'ingredientId')
  @ApiOperation({ summary: '登記食材庫存異動' })
  createTransaction(
    @Param('ingredientId') ingredientId: string,
    @Body() dto: CreateInventoryTransactionDto,
  ): Promise<InventoryTransactionResponseDto> {
    return this.inventoryTransactionsService.create(ingredientId, dto);
  }
}
