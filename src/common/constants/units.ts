import type { UnitCode } from 'src/db/schema/inventory';

export const UNIT_FACTORS: Record<UnitCode, number> = {
  GRM: 1,
  KGM: 1000,
  LTR: 1000,
  MLT: 1,
  H87: 1,
};

export const BASE_UNIT_CODES = ['GRM', 'MLT', 'H87'] as const;
export type BaseUnitCode = (typeof BASE_UNIT_CODES)[number];
