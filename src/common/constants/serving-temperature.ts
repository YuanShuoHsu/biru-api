import type {
  ServingTemperature,
  ServingTemperatureLevel,
} from 'src/db/schema/enums';

export const SERVING_TEMPERATURE_OF_LEVEL: Record<
  ServingTemperatureLevel,
  ServingTemperature
> = {
  Warm: 'Hot',
  Hot: 'Hot',
  RegularIce: 'Iced',
  LessIce: 'Iced',
  LightIce: 'Iced',
  NoIce: 'Iced',
};

export const SERVING_TEMPERATURE_LEVEL_NAMES: Record<
  ServingTemperatureLevel,
  string
> = {
  Warm: '溫',
  Hot: '熱',
  RegularIce: '正常冰',
  LessIce: '少冰',
  LightIce: '微冰',
  NoIce: '去冰',
};
