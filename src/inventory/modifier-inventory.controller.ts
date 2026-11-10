import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HasPermission } from '../menus/decorators/permission.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { MenuItemRecipeDetailResponseDto } from './dto/recipe-response.dto.js';
import { RecipesService } from './recipes.service.js';

@ApiTags('inventory')
@Controller('modifiers/:modifierId')
export class ModifierInventoryController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get('recipe')
  @Roles({ inventory: ['read'] }, 'modifierId')
  @ApiOperation({ summary: '取得客製選項食譜' })
  async findRecipe(
    @Param('modifierId') modifierId: string,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
  ): Promise<MenuItemRecipeDetailResponseDto> {
    return {
      recipe: await this.recipesService.findOneByModifier(
        modifierId,
        canReadPurchasing,
      ),
    };
  }
}
