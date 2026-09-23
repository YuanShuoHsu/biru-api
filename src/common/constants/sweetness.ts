import type { SweetnessLevel } from 'src/db/schema/enums';

export const SWEETNESS_LEVEL_NAMES: Record<SweetnessLevel, string> = {
  FullSugar: '全糖',
  LessSugar: '少糖',
  HalfSugar: '半糖',
  LightSugar: '微糖',
  MinimalSugar: '一分糖',
  NoSugar: '無糖',
};
