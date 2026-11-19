import {
  annualIncomeTax,
  monthlyIncomeTax,
  monthlyPreTaxProfitFor,
} from './income-tax.js';

describe('annualIncomeTax', () => {
  it.each([
    [-50_000, 0],
    [0, 0],
    [120_000, 0],
    [150_000, 15_000],
    [200_000, 40_000],
    [1_000_000, 200_000],
  ])('taxes %d at %d', (income, tax) => {
    expect(annualIncomeTax(income)).toBeCloseTo(tax, 6);
  });
});

describe('monthlyIncomeTax', () => {
  it('estimates the month by annualising its profit', () => {
    expect(monthlyIncomeTax(100_000)).toBeCloseTo(20_000, 6);
    expect(monthlyIncomeTax(10_000)).toBe(0);
    expect(monthlyIncomeTax(-30_000)).toBe(0);
  });
});

describe('monthlyPreTaxProfitFor', () => {
  it.each([0, 5_000, 10_000, 11_000, 13_000, 13_333.33, 50_000])(
    'grosses %d up to the pre-tax profit that leaves it after tax',
    (afterTax) => {
      const preTax = monthlyPreTaxProfitFor(afterTax);

      expect(preTax - monthlyIncomeTax(preTax)).toBeCloseTo(afterTax, 6);
    },
  );

  it('grosses a profit above the exemption up at 20%', () => {
    expect(monthlyPreTaxProfitFor(40_000)).toBeCloseTo(50_000, 6);
  });
});
