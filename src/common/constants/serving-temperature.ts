import type {
  CupSeal,
  ServingTemperature,
  ServingTemperatureLevel,
} from '../../db/schema/enums.js';

export const SERVING_TEMPERATURE_OF_LEVEL: Record<
  ServingTemperatureLevel,
  ServingTemperature
> = {
  RegularIce: 'Iced',
  LessIce: 'Iced',
  LightIce: 'Iced',
  NoIce: 'Iced',
  Warm: 'Hot',
  Hot: 'Hot',
};

export const SERVING_TEMPERATURE_LEVEL_NAMES: Record<
  ServingTemperatureLevel,
  string
> = {
  RegularIce: '正常冰',
  LessIce: '少冰',
  LightIce: '微冰',
  NoIce: '去冰',
  Warm: '溫',
  Hot: '熱',
};

export const DEFAULT_CUP_SEAL: Record<ServingTemperature, CupSeal> = {
  Hot: 'lid',
  Iced: 'film',
};
