import type { LocalizedText } from '../db/schema/enums.js';

export const LOW_STOCK_REACHED_EVENT = 'inventory.lowStockReached';

export interface LowStockReachedEvent {
  organizationId: string;
  ingredients: { id: string; name: LocalizedText }[];
}
