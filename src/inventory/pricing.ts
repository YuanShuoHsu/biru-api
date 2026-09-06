import { UNIT_FACTORS } from 'src/common/constants/units';
import type { Ingredient } from 'src/db/schema/inventory';

type Package = Pick<
  Ingredient,
  'eligibleQuantity' | 'eligibleQuantityUnitCode' | 'price'
>;

export const baseQuantityOf = ({
  eligibleQuantity,
  eligibleQuantityUnitCode,
}: Package): number | null =>
  eligibleQuantity && eligibleQuantityUnitCode
    ? Number(eligibleQuantity) * UNIT_FACTORS[eligibleQuantityUnitCode]
    : null;

export const unitPriceOf = (row: Package): number | null => {
  const baseQuantity = baseQuantityOf(row);

  return row.price && baseQuantity ? Number(row.price) / baseQuantity : null;
};

// 沒填採購規格的食材算不出成本，欄位一律給 null 而不是 0
export const pricingOf = (row: Package) => ({
  packageBaseQuantity: baseQuantityOf(row),
  packageQuantity: row.eligibleQuantity,
  packageUnitCode: row.eligibleQuantityUnitCode,
  unitPrice: unitPriceOf(row),
});
