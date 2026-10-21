import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { MenuItemRecipeDetailResponseDto } from './dto/recipe-response.dto.js';
import { RecipesService } from './recipes.service.js';

@ApiTags('inventory')
@Controller('menu-items/:menuItemId')
export class MenuItemInventoryController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get('recipe')
  @Roles({ inventory: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得品項食譜' })
  async findRecipe(
    @Param('menuItemId') menuItemId: string,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<MenuItemRecipeDetailResponseDto> {
    return {
      recipe: await this.recipesService.findOneByMenuItem(
        menuItemId,
        canReadPurchasing,
      ),
    };
  }
}
