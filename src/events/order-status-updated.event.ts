import type { OrderStatus } from 'src/db/schema/orders';

export const ORDER_STATUS_UPDATED_EVENT = 'order.status.updated';

export interface OrderStatusUpdatedEvent {
  orderId: string;
  orderStatus: OrderStatus;
  organizationId: string;
}
