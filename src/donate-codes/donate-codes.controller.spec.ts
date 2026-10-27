import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { DonateCodesController } from './donate-codes.controller.js';
import { DonateCodesService } from './donate-codes.service.js';

describe('DonateCodesController', () => {
  it('OpenAPI 的回應是捐贈碼陣列', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DonateCodesController],
      providers: [{ provide: DonateCodesService, useValue: {} }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    await app.close();

    expect(document.paths['/donate-codes'].get?.responses['200']).toMatchObject(
      {
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/DonateCodeResponseDto' },
            },
          },
        },
      },
    );
    expect(document.components?.schemas?.DonateCodeResponseDto).toEqual({
      type: 'object',
      properties: {
        donateNm: { type: 'string' },
        donateCode: { type: 'string' },
        donateShortNm: { type: 'string' },
      },
      required: ['donateNm', 'donateCode'],
    });
  });
});
