export const sumOrderItems = (
  items: { orderQuantity: number; unitPrice: string }[],
): number =>
  items.reduce((sum, i) => sum + Number(i.unitPrice) * i.orderQuantity, 0);

export const allocateDiscount = (
  discount: number,
  lineTotals: number[],
): number[] => {
  const cents = Math.round(discount * 100);
  const total = lineTotals.reduce((sum, t) => sum + t, 0);
  if (total <= 0) return lineTotals.map(() => 0);

  const exact = lineTotals.map((t) => (cents * t) / total);
  const allocated = exact.map(Math.floor);
  const leftover = cents - allocated.reduce((sum, c) => sum + c, 0);
  exact
    .map((e, index) => ({ index, remainder: e - Math.floor(e) }))
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, leftover)
    .forEach(({ index }) => (allocated[index] += 1));

  return allocated.map((c) => c / 100);
};
