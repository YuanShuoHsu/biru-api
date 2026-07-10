export const sumOrderItems = (
  items: { orderQuantity: number; unitPrice: string }[],
): number =>
  items.reduce((sum, i) => sum + Number(i.unitPrice) * i.orderQuantity, 0);
