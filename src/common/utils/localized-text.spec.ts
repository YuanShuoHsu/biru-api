import { Controller, Get, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { CreateRecipeDto } from '../../inventory/dto/create-recipe.dto.js';
import { UpdateMenuDto } from '../../menus/dto/update-menu.dto.js';
import { MenuResponseDto } from '../../menus/dto/menu-response.dto.js';

@Controller()
class SchemaController {
  @Get()
  @ApiOkResponse({ type: MenuResponseDto })
  menu() {}

  @Post('menu')
  @ApiBody({ type: UpdateMenuDto })
  updateMenu() {}

  @Post('recipe')
  @ApiBody({ type: CreateRecipeDto })
  createRecipe() {}
}

describe('LOCALIZED_TEXT_SCHEMA', () => {
  it('多語欄位在 OpenAPI 輸出為值為 string 的 map', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchemaController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const { schemas = {} } =
      SwaggerModule.createDocument(app, new DocumentBuilder().build())
        .components ?? {};
    const localizedText = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };

    expect(schemas.MenuResponseDto).toMatchObject({
      properties: {
        name: localizedText,
        description: { ...localizedText, nullable: true },
      },
    });
    expect(schemas.UpdateMenuDto).toMatchObject({
      properties: { name: localizedText },
    });
    expect(schemas.CreateRecipeDto).toMatchObject({
      properties: {
        recipeInstructions: { type: 'array', items: localizedText },
      },
    });

    await app.close();
  });
});
