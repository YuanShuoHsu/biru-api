import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { I18nService } from 'nestjs-i18n';

import { BusinessNoParamDto } from './dto/business-no-param.dto.js';
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

    expect(document.paths['/gcis/{businessNo}'].get?.parameters).toEqual([
      expect.objectContaining({
        description: '統一編號（8 位數字，須通過檢查碼）',
        in: 'path',
        name: 'businessNo',
        required: true,
      }),
    ]);
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

    await expect(
      controller.findOne({ businessNo: '12345675' }),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'companyNotFound',
        message: 'common.gcis.companyNotFound',
      },
    });
  });

  it.each(['1234', '12345678'])(
    '統一編號 %s 格式錯誤或檢查碼不符時驗證失敗',
    async (businessNo) => {
      const errors = await validate(
        plainToInstance(BusinessNoParamDto, { businessNo }),
      );

      expect(errors.map(({ constraints }) => constraints)).toEqual([
        {
          isBusinessNumber: expect.stringMatching(
            /^validation\.businessNumber\|/,
          ),
        },
      ]);
    },
  );
});
