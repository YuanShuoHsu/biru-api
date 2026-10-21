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

import { Audit } from '../common/decorators/audit.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';

import { ReorderDto } from '../menus/dto/reorder.dto.js';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
  UpdateRecipeIngredientDto,
} from './dto/create-recipe.dto.js';
import { RecipeIngredientPaginationQueryDto } from './dto/recipe-ingredient-pagination-query.dto.js';
import {
  RecipeIngredientResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto.js';
import { RecipesService } from './recipes.service.js';

@ApiTags('inventory')
@Controller('recipes/:recipeId')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @Roles({ inventory: ['read'] }, 'recipeId')
  @ApiOperation({ summary: '取得食譜' })
  findOne(
    @Param('recipeId') recipeId: string,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.findOne(recipeId, canReadPurchasing);
  }

  @Patch()
  @Roles({ inventory: ['update'] }, 'recipeId')
  @Audit('recipe', { param: 'recipeId' })
  @ApiOperation({ summary: '更新食譜' })
  update(
    @Param('recipeId') recipeId: string,
    @Body() dto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.update(recipeId, dto);
  }

  @Delete()
  @Roles({ inventory: ['delete'] }, 'recipeId')
  @Audit('recipe', { param: 'recipeId' })
  @ApiOperation({ summary: '刪除食譜' })
  remove(@Param('recipeId') recipeId: string): Promise<void> {
    return this.recipesService.remove(recipeId);
  }

  @Get('recipe-ingredients')
  @Roles({ inventory: ['read'] }, 'recipeId')
  @ApiOperation({ summary: '查詢食譜材料' })
  findAllIngredients(
    @Param('recipeId') recipeId: string,
    @Query() query: RecipeIngredientPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<{ data: RecipeIngredientResponseDto[]; total: number }> {
    return this.recipesService.findAllIngredients(
      recipeId,
      query,
      canReadPurchasing,
    );
  }

  @Post('recipe-ingredients')
  @Roles({ inventory: ['create'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { column: 'recipeId', param: 'recipeId' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '新增食譜材料' })
  createIngredient(
    @Param('recipeId') recipeId: string,
    @Body() dto: CreateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    return this.recipesService.createIngredient(recipeId, dto);
  }

  @Patch('recipe-ingredients/reorder')
  @Roles({ inventory: ['update'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { body: 'ids' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '重新排序食譜材料' })
  reorderIngredients(
    @Param('recipeId') recipeId: string,
    @Body() { ids, offset }: ReorderDto,
  ): Promise<void> {
    return this.recipesService.reorderIngredients(recipeId, ids, offset);
  }

  @Patch('recipe-ingredients/:recipeIngredientId')
  @Roles({ inventory: ['update'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { param: 'recipeIngredientId' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '更新食譜材料' })
  updateIngredient(
    @Param('recipeId') recipeId: string,
    @Param('recipeIngredientId') recipeIngredientId: string,
    @Body() dto: UpdateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    return this.recipesService.updateIngredient(
      recipeId,
      recipeIngredientId,
      dto,
    );
  }

  @Delete('recipe-ingredients')
  @Roles({ inventory: ['delete'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { body: 'ids' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '批次刪除食譜材料' })
  removeIngredients(
    @Param('recipeId') recipeId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.recipesService.removeIngredients(recipeId, ids);
  }

  @Delete('recipe-ingredients/:recipeIngredientId')
  @Roles({ inventory: ['delete'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { param: 'recipeIngredientId' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '刪除食譜材料' })
  removeIngredient(
    @Param('recipeId') recipeId: string,
    @Param('recipeIngredientId') recipeIngredientId: string,
  ): Promise<void> {
    return this.recipesService.removeIngredient(recipeId, recipeIngredientId);
  }
}
