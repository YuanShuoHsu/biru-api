import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';

import { GcisController } from './gcis.controller.js';
import { GcisService } from './gcis.service.js';

describe('GcisController', () => {
  it('OpenAPI 的回應是公司名稱、地址與負責人', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GcisController],
      providers: [
        { provide: GcisService, useValue: {} },
        { provide: I18nService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    await app.close();

    expect(
      document.paths['/gcis/{businessNo}'].get?.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/BusinessInfoResponseDto' },
        },
      },
    });
    expect(document.components?.schemas?.BusinessInfoResponseDto).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        representativeName: { type: 'string' },
      },
      required: ['name', 'address', 'representativeName'],
    });
  });
});
