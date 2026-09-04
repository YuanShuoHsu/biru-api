import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from 'src/common/decorators/audit.decorator';

import { Roles } from 'src/menus/decorators/roles.decorator';

import {
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
  UpdateRecipeIngredientDto,
} from './dto/create-recipe.dto';
import {
  RecipeIngredientResponseDto,
  RecipeResponseDto,
} from './dto/recipe-response.dto';
import { RecipesService } from './recipes.service';

@ApiTags('inventory')
@Controller('recipes/:recipeId')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @Roles({ inventory: ['read'] }, 'recipeId')
  @ApiOperation({ summary: '取得食譜' })
  findOne(@Param('recipeId') recipeId: string): Promise<RecipeResponseDto> {
    return this.recipesService.findOne(recipeId);
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
  ): Promise<RecipeIngredientResponseDto[]> {
    return this.recipesService.findAllIngredients(recipeId);
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

  @Patch('recipe-ingredients/:recipeIngredientId')
  @Roles({ inventory: ['update'] }, 'recipeId')
  @Audit({
    resource: 'recipe',
    idSource: { param: 'recipeIngredientId' },
    via: { table: 'recipeIngredient', ownerColumn: 'recipeId' },
  })
  @ApiOperation({ summary: '更新食譜材料' })
  updateIngredient(
    @Param('recipeIngredientId') recipeIngredientId: string,
    @Body() dto: UpdateRecipeIngredientDto,
  ): Promise<RecipeIngredientResponseDto> {
    return this.recipesService.updateIngredient(recipeIngredientId, dto);
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
    @Param('recipeIngredientId') recipeIngredientId: string,
  ): Promise<void> {
    return this.recipesService.removeIngredient(recipeIngredientId);
  }
}
