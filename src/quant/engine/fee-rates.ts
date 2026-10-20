import type { PionexMarketType } from '../pionex/pionex.types';

// Pionex API 沒有查詢費率的端點，以官網普通用戶費率為準：https://www.pionex.com/zh-TW/fees
export const PIONEX_FEE_RATES = {
  PERP: { maker: 0.0002, taker: 0.0005 },
  SPOT: { maker: 0.0005, taker: 0.0005 },
} as const satisfies Record<PionexMarketType, { maker: number; taker: number }>;
