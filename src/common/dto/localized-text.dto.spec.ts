import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LocalizedTextDto } from './localized-text.dto.js';

class LocalizedTextFieldsDto {
  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedText;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  description: LocalizedText | null;

  @ApiPropertyOptional({ type: [LocalizedTextDto], nullable: true })
  steps: LocalizedText[] | null;
}

@Controller()
class LocalizedTextFieldsController {
  @Get()
  @ApiOkResponse({ type: LocalizedTextFieldsDto })
  find() {}
}

describe('LocalizedTextDto', () => {
  it('多語欄位在 OpenAPI 輸出為五個語系皆選填的 string 物件', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LocalizedTextFieldsController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const schemas =
      SwaggerModule.createDocument(app, new DocumentBuilder().build())
        .components?.schemas ?? {};
    await app.close();

    const string = { type: 'string' };
    const localizedText = { $ref: '#/components/schemas/LocalizedTextDto' };
    expect(schemas.LocalizedTextDto).toEqual({
      type: 'object',
      properties: {
        en: string,
        ja: string,
        ko: string,
        'zh-CN': string,
        'zh-TW': string,
      },
    });
    expect(schemas.LocalizedTextFieldsDto).toMatchObject({
      properties: {
        name: localizedText,
        description: { allOf: [localizedText], nullable: true },
        steps: { type: 'array', nullable: true, items: localizedText },
      },
      required: ['name'],
    });
  });
});
