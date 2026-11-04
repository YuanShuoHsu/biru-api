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

  it('查不到公司時回 404 並帶 companyNotFound', async () => {
    const controller = new GcisController(
      {
        findByBusinessNo: () => Promise.resolve(null),
      } as unknown as GcisService,
      { t: (key: string) => key } as unknown as I18nService,
    );

    await expect(controller.findOne('12345678')).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'companyNotFound',
        message: 'common.gcis.companyNotFound',
      },
    });
  });

  it('統一編號格式錯誤時回 400 並帶 invalidBusinessNo', async () => {
    const controller = new GcisController(
      {} as GcisService,
      { t: (key: string) => key } as unknown as I18nService,
    );

    await expect(controller.findOne('1234')).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'invalidBusinessNo',
        message: 'common.gcis.invalidBusinessNo',
      },
    });
  });
});
