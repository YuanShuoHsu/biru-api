import {
  Body,
  Controller,
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
import { ReorderDto } from 'src/menus/dto/reorder.dto';

import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { IngredientPaginationQueryDto } from './dto/ingredient-pagination-query.dto';
import { IngredientResponseDto } from './dto/ingredient-response.dto';
import { RecipePaginationQueryDto } from './dto/recipe-pagination-query.dto';
import { RecipeResponseDto } from './dto/recipe-response.dto';
import { SupplierPaginationQueryDto } from './dto/supplier-pagination-query.dto';
import { SupplierResponseDto } from './dto/supplier-response.dto';
import { IngredientsService } from './ingredients.service';
import { RecipesService } from './recipes.service';
import { SuppliersService } from './suppliers.service';

@ApiTags('inventory')
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

  @Get('suppliers')
  @Roles({ purchasing: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢供應商列表' })
  findAllSuppliers(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: SupplierPaginationQueryDto,
  ): Promise<{ data: SupplierResponseDto[]; total: number }> {
    return this.suppliersService.findAll(organizationSlug, query);
  }

  @Post('suppliers')
  @Roles({ purchasing: ['create'] }, 'organizationSlug')
  @Audit('supplier', { response: true })
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
