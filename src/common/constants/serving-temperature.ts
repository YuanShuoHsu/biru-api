import type { ServingTemperature } from 'src/db/schema/enums';

// 綠界品名等對外文字用預設語系（zh-TW），與訂單快照的品名一致
export const SERVING_TEMPERATURE_NAMES: Record<ServingTemperature, string> = {
  Hot: '熱',
  Iced: '冰',
};
