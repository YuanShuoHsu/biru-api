import type { RefundReasonCode } from '../db/schema/refunds.js';

export const REFUND_SETTLED_EVENT = 'refund.settled';

export interface RefundSettledEvent {
  orderId: string;
  organizationId: string;
  reasonCode: RefundReasonCode | null;
  refundId: string;
}
