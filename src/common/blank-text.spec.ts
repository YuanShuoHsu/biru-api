import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AssignAttendanceParentalChildDto } from '../attendance/dto/assign-attendance-parental-child.dto.js';
import { SaveAttendanceShiftTypeDto } from '../attendance/dto/attendance-shift-type.dto.js';
import { CreateAttendanceAnnualLeaveDeferralDto } from '../attendance/dto/create-attendance-annual-leave-deferral.dto.js';
import { CreateAttendanceLeaveCaseDto } from '../attendance/dto/create-attendance-leave-case.dto.js';
import { CreateAttendanceParentalChildDto } from '../attendance/dto/create-attendance-parental-child.dto.js';
import { CreateAttendanceParentalReturnDto } from '../attendance/dto/create-attendance-parental-return.dto.js';
import { CreateAttendanceRequestDto } from '../attendance/dto/create-attendance-request.dto.js';
import { ReviewLeaveCaseDto } from '../attendance/dto/review-attendance-request.dto.js';
import { SaveAttendanceLeaveTypeDto } from '../attendance/dto/save-attendance-leave-type.dto.js';
import { CreateCouponDto } from '../coupons/dto/create-coupon.dto.js';
import { languagesEnum } from '../db/schema/enums.js';
import { CreateIngredientDto } from '../inventory/dto/create-ingredient.dto.js';
import { CreateRecipeDto } from '../inventory/dto/create-recipe.dto.js';
import { CreateSupplierDto } from '../inventory/dto/create-supplier.dto.js';
import { CreateMenuItemDto } from '../menus/dto/create-menu-item.dto.js';
import { CreateMenuSectionDto } from '../menus/dto/create-menu-section.dto.js';
import { CreateMenuDto } from '../menus/dto/create-menu.dto.js';
import { CreateModifierGroupDto } from '../menus/dto/create-modifier-group.dto.js';
import { CreateModifierDto } from '../menus/dto/create-modifier.dto.js';
import { UpdateModifierGroupDto } from '../menus/dto/update-modifier-group.dto.js';
import { UpdateModifierDto } from '../menus/dto/update-modifier.dto.js';
import { CreateOrderCustomerDto } from '../orders/dto/create-order.dto.js';
import { CreateOrderTicketPrinterDto } from '../orders/dto/order-ticket.dto.js';
import { CreateSpecialHoursDto } from '../organizations/dto/special-hours.dto.js';
import { ConfirmRuleSetDto } from '../payroll/dto/confirm-rule-set.dto.js';
import { RenamePayrollEarningTypeDto } from '../payroll/dto/payroll-earning.dto.js';
import {
  PayrollTaxIdentityDto,
  PayrollWithholdingUnitDto,
} from '../payroll/dto/payroll-withholding.dto.js';
import { CreateStorePhotoDto } from '../store-photos/dto/create-store-photo.dto.js';
import { CreateWaitlistTicketDto } from '../waitlist/dto/create-waitlist-ticket.dto.js';

type Dto = new () => object;

const errorFields = async (dto: Dto, body: object) =>
  (await validate(plainToInstance(dto, body))).map(({ property }) => property);

const textFields: [Dto, string][] = [
  [AssignAttendanceParentalChildDto, 'reason'],
  [SaveAttendanceShiftTypeDto, 'name'],
  [CreateAttendanceAnnualLeaveDeferralDto, 'reason'],
  [CreateAttendanceLeaveCaseDto, 'reason'],
  [CreateAttendanceParentalChildDto, 'reference'],
  [CreateAttendanceParentalChildDto, 'label'],
  [CreateAttendanceParentalReturnDto, 'reason'],
  [CreateAttendanceRequestDto, 'reason'],
  [SaveAttendanceLeaveTypeDto, 'name'],
  [CreateCouponDto, 'code'],
  [CreateSupplierDto, 'name'],
  [CreateOrderCustomerDto, 'name'],
  [CreateOrderTicketPrinterDto, 'name'],
  [ConfirmRuleSetDto, 'sourceLabel'],
  [RenamePayrollEarningTypeDto, 'name'],
  [PayrollWithholdingUnitDto, 'name'],
  [PayrollWithholdingUnitDto, 'address'],
  [PayrollWithholdingUnitDto, 'agentName'],
  [PayrollWithholdingUnitDto, 'representativeName'],
  [PayrollWithholdingUnitDto, 'contactName'],
  [PayrollTaxIdentityDto, 'address'],
  [CreateWaitlistTicketDto, 'name'],
];

describe('必填文字欄位', () => {
  it.each(textFields)('%o 的 %s 只有空白時擋下', async (dto, field) => {
    expect(await errorFields(dto, { [field]: '   ' })).toContain(field);
  });

  it.each(textFields)('%o 的 %s 去掉前後空白後通過', async (dto, field) => {
    const instance = plainToInstance(dto, { [field]: ' 碧露 ' }) as Record<
      string,
      unknown
    >;

    expect(instance[field]).toBe('碧露');
    expect(
      (await validate(instance)).map(({ property }) => property),
    ).not.toContain(field);
  });
});

describe('特殊營業日的營業時間', () => {
  it('只有空白時擋下，null 仍代表公休', async () => {
    expect(
      await errorFields(CreateSpecialHoursDto, { openingHours: '  ' }),
    ).toContain('openingHours');
    expect(
      await errorFields(CreateSpecialHoursDto, { openingHours: null }),
    ).not.toContain('openingHours');
  });
});

const fullText = (text: string) =>
  Object.fromEntries(
    languagesEnum.enumValues.map((language) => [language, text]),
  );

const completeLocalizedFields: [Dto, string][] = [
  [CreateMenuDto, 'name'],
  [CreateMenuSectionDto, 'name'],
  [CreateMenuItemDto, 'name'],
  [CreateModifierDto, 'displayName'],
  [UpdateModifierDto, 'displayName'],
  [CreateModifierGroupDto, 'displayName'],
  [UpdateModifierGroupDto, 'displayName'],
  [CreateIngredientDto, 'name'],
  [CreateStorePhotoDto, 'alt'],
];

describe('五個語系都必填的多語系欄位', () => {
  it.each(completeLocalizedFields)(
    '%o 的 %s 有任一語系空白就擋下',
    async (dto, field) => {
      for (const value of [
        {},
        { 'zh-TW': '  ' },
        { ...fullText('拿鐵'), en: ' ' },
        { 'zh-TW': '拿鐵' },
      ])
        expect(await errorFields(dto, { [field]: value })).toContain(field);
    },
  );

  it.each(completeLocalizedFields)(
    '%o 的 %s 每個語系都有字就通過',
    async (dto, field) => {
      expect(
        await errorFields(dto, { [field]: fullText('拿鐵') }),
      ).not.toContain(field);
    },
  );
});

describe('選填的多語系說明：全部不填或全部填', () => {
  const dtos: Dto[] = [CreateMenuDto, CreateMenuSectionDto, CreateMenuItemDto];

  it.each(dtos)('%o 的 description 全部空白時視為不填', async (dto) => {
    const instance = plainToInstance(dto, {
      description: { en: '', 'zh-TW': ' ' },
    }) as { description?: unknown };

    expect(instance.description).toBeNull();
    expect(
      (await validate(instance)).map(({ property }) => property),
    ).not.toContain('description');
  });

  it.each(dtos)('%o 的 description 只填部分語系時擋下', async (dto) => {
    expect(
      await errorFields(dto, { description: { 'zh-TW': '招牌' } }),
    ).toContain('description');
  });

  it.each(dtos)('%o 的 description 每個語系都有字就通過', async (dto) => {
    expect(
      await errorFields(dto, { description: fullText('招牌') }),
    ).not.toContain('description');
  });
});

describe('食譜名稱沿用品項名稱，至少要有一個語系', () => {
  it('每個語系都空白時擋下，有一個語系有字就通過', async () => {
    expect(
      await errorFields(CreateRecipeDto, { name: { 'zh-TW': ' ' } }),
    ).toContain('name');
    expect(
      await errorFields(CreateRecipeDto, { name: { 'zh-TW': '拿鐵' } }),
    ).not.toContain('name');
  });
});

describe('核准事件假時的事件識別', () => {
  it('只有空白時擋下，前後空白會去掉', async () => {
    expect(
      await errorFields(ReviewLeaveCaseDto, { reference: '  ' }),
    ).toContain('reference');

    const instance = plainToInstance(ReviewLeaveCaseDto, {
      reference: ' 婚禮 ',
    });
    expect(instance.reference).toBe('婚禮');
  });
});
