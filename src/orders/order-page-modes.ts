import type { OrderMode } from '../db/schema/orders.js';

// 前台點餐頁 order/[mode] 的路徑段，前台改路由要一起改
export const ORDER_PAGE_MODES: Record<OrderMode, string> = {
  counter: 'counter',
  dineIn: 'dine-in',
  driveThru: 'drive-thru',
  pickup: 'pickup',
};
