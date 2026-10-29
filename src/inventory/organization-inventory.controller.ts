import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

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
import {
  IngredientListResponseDto,
  IngredientResponseDto,
} from './dto/ingredient-response.dto.js';
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
import { MenuStockInterceptor } from './menu-stock.interceptor.js';
import { RecipesService } from './recipes.service.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('inventory')
@ApiParam({ name: 'organizationSlug' })
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
  ): Promise<IngredientResponseDto> {
    return this.ingredientsService.create(organizationId, dto);
  }

  @Patch('ingredients/reorder')
  @Roles({ inventory: ['update'] }, 'organizationSlug')
  @Audit('ingredient', { body: 'ids' })
  @ApiOperation({ summary: '重新排序食材' })
  reorderIngredients(
    @OrganizationId() organizationId: string,
    @Body() { ids, offset }: ReorderDto,
  ): Promise<void> {
    return this.ingredientsService.reorder(organizationId, ids, offset);
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
