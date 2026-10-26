import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import {
  ApiLocalizedTextProperty,
  ApiLocalizedTextPropertyOptional,
} from './api-localized-text-property.decorator.js';

class LocalizedTextFieldsDto {
  @ApiLocalizedTextProperty()
  name: Record<string, string>;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
  description: Record<string, string> | null;

  @ApiLocalizedTextPropertyOptional({ isArray: true, nullable: true })
  steps: Record<string, string>[] | null;
}

@Controller()
class LocalizedTextFieldsController {
  @Get()
  @ApiOkResponse({ type: LocalizedTextFieldsDto })
  find() {}
}

describe('ApiLocalizedTextProperty', () => {
  it('多語欄位在 OpenAPI 輸出為值為 string 的 map', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LocalizedTextFieldsController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const schema = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    ).components?.schemas?.LocalizedTextFieldsDto;
    await app.close();

    const localizedText = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };
    expect(schema).toMatchObject({
      properties: {
        name: localizedText,
        description: { ...localizedText, nullable: true },
        steps: { type: 'array', nullable: true, items: localizedText },
      },
      required: ['name'],
    });
  });
});
