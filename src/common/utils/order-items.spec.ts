import { allocateDiscount } from './order-items.js';

describe('allocateDiscount', () => {
  it('splits the discount by line total and keeps the sum exact', () => {
    const split = allocateDiscount(10, [100, 100, 100]);

    expect(split).toEqual([3.34, 3.33, 3.33]);
    expect(split.reduce((sum, d) => sum + d, 0)).toBeCloseTo(10, 10);
  });

  it('leaves lines with no eligible amount at zero', () => {
    expect(allocateDiscount(50, [0, 100])).toEqual([0, 50]);
  });

  it('gives each line its whole total when the discount equals the eligible total', () => {
    expect(allocateDiscount(7, [3, 3, 1])).toEqual([3, 3, 1]);
  });

  it('returns zeros when nothing is eligible', () => {
    expect(allocateDiscount(0, [0, 0])).toEqual([0, 0]);
  });
});
