import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SaveAttendanceLeaveTypeDto } from '../attendance/dto/save-attendance-leave-type.dto.js';
import { CreateMenuItemDto } from '../menus/dto/create-menu-item.dto.js';
import { AiConfigDto } from '../quant/dto/quant-bot.dto.js';

// 和 main.ts 的全域 I18nValidationPipe 一致
const pipeOptions = { forbidNonWhitelisted: true, whitelist: true };

const errorsOf = async (dto: new () => object, body: object) => {
  const instance = plainToInstance(dto, body);

  return {
    instance,
    errors: (await validate(instance, pipeOptions)).map(
      ({ property, children }) =>
        children?.length
          ? `${property}.${children.map((child) => child.property).join(',')}`
          : property,
    ),
  };
};

describe('品項營養資訊', () => {
  it('接受營養欄位並去掉前後空白', async () => {
    const { errors, instance } = await errorsOf(CreateMenuItemDto, {
      nutrition: { calories: ' 180 calories ', sugarContent: '17 g' },
    });

    expect(errors).not.toContainEqual(expect.stringMatching(/^nutrition/));
    expect((instance as CreateMenuItemDto).nutrition).toEqual({
      calories: '180 calories',
      sugarContent: '17 g',
    });
  });

  it.each([
    [{ calories: '  ' }, 'nutrition.calories'],
    [{ calories: null }, 'nutrition.calories'],
    [{ calories: 180 }, 'nutrition.calories'],
    [{ unknownField: '1 g' }, 'nutrition.unknownField'],
  ])('擋下 %j', async (nutrition, error) => {
    expect((await errorsOf(CreateMenuItemDto, { nutrition })).errors).toContain(
      error,
    );
  });
});

describe('AI 每月費用上限', () => {
  const base = { source: 'claude_code' };

  it.each([
    [{ source: 'claude_api' }, true],
    [{ source: 'claude_api', monthlyCostLimit: 10 }, false],
    [base, false],
    [{ ...base, monthlyCostLimit: 10 }, false],
    [{ ...base, monthlyCostLimit: 'abc' }, true],
    [{ ...base, monthlyCostLimit: -1 }, true],
    [{ ...base, monthlyCostLimit: null }, true],
  ])('%j 擋下：%s', async (body, rejected) => {
    const { errors } = await errorsOf(AiConfigDto, body);

    expect(errors.includes('monthlyCostLimit')).toBe(rejected);
  });
});

describe('假別的需要額度', () => {
  it('不能送 null，不傳仍可以', async () => {
    expect(
      (await errorsOf(SaveAttendanceLeaveTypeDto, { requiresBalance: null }))
        .errors,
    ).toContain('requiresBalance');
    expect(
      (await errorsOf(SaveAttendanceLeaveTypeDto, {})).errors,
    ).not.toContain('requiresBalance');
  });
});
