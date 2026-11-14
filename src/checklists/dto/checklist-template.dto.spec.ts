import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
} from './checklist-template.dto.js';

const pipeOptions = { forbidNonWhitelisted: true, whitelist: true };

const errorsOf = async (dto: new () => object, body: object) =>
  (await validate(plainToInstance(dto, body), pipeOptions)).map(
    ({ property }) => property,
  );

describe('ChecklistTemplate DTO', () => {
  const base = { name: '開店', timing: 'opening', items: [] };

  it('新增時 enabled 不能送 null，不傳仍可以', async () => {
    await expect(
      errorsOf(CreateChecklistTemplateDto, { ...base, enabled: null }),
    ).resolves.toEqual(['enabled']);
    await expect(errorsOf(CreateChecklistTemplateDto, base)).resolves.toEqual(
      [],
    );
  });

  it.each(['name', 'timing', 'enabled', 'items'])(
    '更新時 %s 不能送 null',
    async (field) => {
      await expect(
        errorsOf(UpdateChecklistTemplateDto, { [field]: null }),
      ).resolves.toEqual([field]);
    },
  );

  it('更新時欄位都可以不傳，項目的單位與範圍可以是 null', async () => {
    await expect(errorsOf(UpdateChecklistTemplateDto, {})).resolves.toEqual([]);
    await expect(
      errorsOf(UpdateChecklistTemplateDto, {
        items: [
          {
            label: '冷藏庫',
            type: 'number',
            unit: null,
            minValue: null,
            maxValue: null,
          },
        ],
      }),
    ).resolves.toEqual([]);
  });
});
