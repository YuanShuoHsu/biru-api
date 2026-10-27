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
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';

import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';
import { ReorderDto } from '../menus/dto/reorder.dto.js';

import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { IngredientPaginationQueryDto } from './dto/ingredient-pagination-query.dto.js';
import { IngredientResponseDto } from './dto/ingredient-response.dto.js';
import { RecipePaginationQueryDto } from './dto/recipe-pagination-query.dto.js';
import { RecipeResponseDto } from './dto/recipe-response.dto.js';
import { SupplierPaginationQueryDto } from './dto/supplier-pagination-query.dto.js';
import { SupplierResponseDto } from './dto/supplier-response.dto.js';
import { IngredientsService } from './ingredients.service.js';
import { MenuStockInterceptor } from './menu-stock.interceptor.js';
import { RecipesService } from './recipes.service.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('inventory')
@UseInterceptors(MenuStockInterceptor)
@Controller('organizations/:organizationSlug')
export class OrganizationInventoryController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly recipesService: RecipesService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Get('ingredients')
  @Roles({ inventory: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢食材列表' })
  findAllIngredients(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: IngredientPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<{ data: IngredientResponseDto[]; total: number }> {
    return this.ingredientsService.findAll(
      organizationSlug,
      query,
      canReadPurchasing,
    );
  }

  @Post('ingredients')
  @Roles({ inventory: ['create'] }, 'organizationSlug')
  @Audit('ingredient', { response: true })
  @ApiOperation({ summary: '建立食材' })
  createIngredient(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateIngredientDto,
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.create(organizationSlug, dto);
  }

  @Patch('ingredients/reorder')
  @Roles({ inventory: ['update'] }, 'organizationSlug')
  @Audit('ingredient', { body: 'ids' })
  @ApiOperation({ summary: '重新排序食材' })
  reorderIngredients(
    @Param('organizationSlug') organizationSlug: string,
    @Body() { ids, offset }: ReorderDto,
  ): Promise<void> {
    return this.ingredientsService.reorder(organizationSlug, ids, offset);
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
  findAllSuppliers(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: SupplierPaginationQueryDto,
  ): Promise<{ data: SupplierResponseDto[]; total: number }> {
    return this.suppliersService.findAll(organizationSlug, query);
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
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.suppliersService.create(organizationSlug, dto);
  }

  @Get('recipes')
  @Roles({ inventory: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢食譜列表' })
  findAllRecipes(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: RecipePaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<{ data: RecipeResponseDto[]; total: number }> {
    return this.recipesService.findAll(
      organizationSlug,
      query,
      canReadPurchasing,
    );
  }

  @Post('recipes')
  @Roles({ inventory: ['create'] }, 'organizationSlug')
  @Audit('recipe', { response: true })
  @ApiOperation({ summary: '建立食譜' })
  createRecipe(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.create(organizationSlug, dto);
  }
}
