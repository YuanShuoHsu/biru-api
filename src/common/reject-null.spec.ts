import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelAttendanceShiftDto } from '../attendance/dto/create-attendance-shifts.dto.js';
import {
  CreateCouponDto,
  UpdateCouponDto,
} from '../coupons/dto/create-coupon.dto.js';
import { UpdateIngredientDto } from '../inventory/dto/create-ingredient.dto.js';
import {
  CreateRecipeDto,
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
  UpdateRecipeIngredientDto,
} from '../inventory/dto/create-recipe.dto.js';
import { UpdateSupplierDto } from '../inventory/dto/create-supplier.dto.js';
import { CreateModifierGroupDto } from '../menus/dto/create-modifier-group.dto.js';
import { CreateModifierDto } from '../menus/dto/create-modifier.dto.js';
import { CreateOfferDto } from '../menus/dto/create-offer.dto.js';
import { UpdateMenuSectionDto } from '../menus/dto/update-menu-section.dto.js';
import { UpdateMenuDto } from '../menus/dto/update-menu.dto.js';
import { UpdateModifierGroupDto } from '../menus/dto/update-modifier-group.dto.js';
import { UpdateModifierDto } from '../menus/dto/update-modifier.dto.js';
import { UpdateOfferDto } from '../menus/dto/update-offer.dto.js';
import { PayrollReviewDto } from '../payroll/dto/payroll-review.dto.js';
import {
  AiConfigDto,
  DcaConfigDto,
  FuturesGridConfigDto,
  FuturesGridOperationDto,
  FuturesGridStopDto,
  GridConfigDto,
  GridOperationDto,
  IndicatorConditionDto,
  IndicatorConfigDto,
  ResumeAiBacktestDto,
  SignalBotConfigDto,
  StopQuantBotDto,
  WebhookSignalDto,
} from '../quant/dto/quant-bot.dto.js';
import { PreviewFuturesOrderDto } from '../quant/dto/quant-futures.dto.js';

type Dto = new () => object;

const errorFields = async (dto: Dto, body: object) =>
  (await validate(plainToInstance(dto, body))).map(({ property }) => property);

const notNullable: [Dto, string][] = [
  [CancelAttendanceShiftDto, 'reason'],
  [PayrollReviewDto, 'reason'],
  [PayrollReviewDto, 'acknowledgedViolations'],
  [UpdateMenuDto, 'name'],
  [UpdateMenuSectionDto, 'name'],
  [UpdateOfferDto, 'price'],
  [CreateOfferDto, 'availability'],
  [CreateModifierGroupDto, 'minSelectionCount'],
  [UpdateModifierGroupDto, 'displayName'],
  [UpdateModifierGroupDto, 'minSelectionCount'],
  [CreateModifierDto, 'availability'],
  [CreateModifierDto, 'availableModes'],
  [UpdateModifierDto, 'displayName'],
  [UpdateModifierDto, 'availability'],
  [UpdateModifierDto, 'availableModes'],
  [UpdateIngredientDto, 'name'],
  [UpdateIngredientDto, 'unitCode'],
  [UpdateIngredientDto, 'price'],
  [UpdateIngredientDto, 'eligibleQuantity'],
  [UpdateIngredientDto, 'eligibleQuantityUnitCode'],
  [UpdateSupplierDto, 'name'],
  [UpdateRecipeDto, 'name'],
  [CreateRecipeDto, 'recipeYield'],
  [UpdateRecipeDto, 'recipeYield'],
  [CreateRecipeIngredientDto, 'sortOrder'],
  [UpdateRecipeIngredientDto, 'ingredientId'],
  [UpdateRecipeIngredientDto, 'requiredQuantity'],
  [UpdateRecipeIngredientDto, 'sortOrder'],
  [UpdateCouponDto, 'code'],
  [UpdateCouponDto, 'discountType'],
  [CreateCouponDto, 'discountCurrency'],
  [CreateCouponDto, 'isActive'],
  [CreateCouponDto, 'isClaimable'],
  [CreateCouponDto, 'isPublic'],
  [CreateCouponDto, 'scope'],
  [CreateCouponDto, 'menuItemIds'],
  [CreateCouponDto, 'menuSectionIds'],
  [UpdateCouponDto, 'isActive'],
  [UpdateCouponDto, 'scope'],
  [PreviewFuturesOrderDto, 'price'],
  [FuturesGridStopDto, 'limitPrice'],
  [GridConfigDto, 'slippage'],
  [FuturesGridConfigDto, 'extraMargin'],
  [FuturesGridConfigDto, 'lossStopHigh'],
  [FuturesGridConfigDto, 'lossStopLimitHigh'],
  [FuturesGridConfigDto, 'slippage'],
  [SignalBotConfigDto, 'takeProfit'],
  [SignalBotConfigDto, 'stopLoss'],
  [DcaConfigDto, 'stopLoss'],
  [IndicatorConditionDto, 'period'],
  [IndicatorConditionDto, 'fast'],
  [IndicatorConditionDto, 'slow'],
  [IndicatorConditionDto, 'operator'],
  [IndicatorConditionDto, 'value'],
  [IndicatorConditionDto, 'direction'],
  [IndicatorConditionDto, 'stdDev'],
  [IndicatorConditionDto, 'band'],
  [IndicatorConfigDto, 'takeProfit'],
  [IndicatorConfigDto, 'stopLoss'],
  [AiConfigDto, 'takeProfit'],
  [AiConfigDto, 'stopLoss'],
  [StopQuantBotDto, 'closeModel'],
  [WebhookSignalDto, 'amount'],
  [GridOperationDto, 'top'],
  [GridOperationDto, 'bottom'],
  [GridOperationDto, 'row'],
  [ResumeAiBacktestDto, 'monthlyCostLimit'],
];

describe('不能存成 null 的欄位', () => {
  it.each(notNullable)('%o 的 %s 送 null 時擋下', async (dto, field) => {
    expect(await errorFields(dto, { [field]: null })).toContain(field);
  });

  it.each(notNullable)('%o 的 %s 不傳時不檢查', async (dto, field) => {
    expect(await errorFields(dto, {})).not.toContain(field);
  });
});

const clearable: [Dto, string][] = [
  [UpdateMenuDto, 'description'],
  [UpdateMenuDto, 'image'],
  [UpdateMenuSectionDto, 'parentSectionId'],
  [UpdateMenuSectionDto, 'orderTicketPrinterId'],
  [UpdateOfferDto, 'availableHours'],
  [UpdateModifierGroupDto, 'maxSelectionCount'],
  [UpdateModifierDto, 'priceAdjustment'],
  [UpdateIngredientDto, 'supplierId'],
  [UpdateIngredientDto, 'note'],
  [UpdateSupplierDto, 'telephone'],
  [UpdateRecipeDto, 'menuItemId'],
  [UpdateCouponDto, 'applicableOrganizationIds'],
  [UpdateCouponDto, 'issueTrigger'],
  [UpdateCouponDto, 'validThrough'],
  [FuturesGridOperationDto, 'lossStop'],
  [FuturesGridOperationDto, 'profitStop'],
];

describe('null 代表清除的欄位', () => {
  it.each(clearable)('%o 的 %s 仍可送 null', async (dto, field) => {
    expect(await errorFields(dto, { [field]: null })).not.toContain(field);
  });
});
