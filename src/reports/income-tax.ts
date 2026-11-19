// https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340003&flno=5
const EXEMPT_INCOME = 120_000;
const INCOME_TAX_RATE = 0.2;
const MARGINAL_CAP_RATE = 0.5;

const MONTHS_PER_YEAR = 12;

export const annualIncomeTax = (taxableIncome: number): number =>
  taxableIncome <= EXEMPT_INCOME
    ? 0
    : Math.min(
        taxableIncome * INCOME_TAX_RATE,
        (taxableIncome - EXEMPT_INCOME) * MARGINAL_CAP_RATE,
      );

export const monthlyIncomeTax = (monthlyPreTaxProfit: number): number =>
  annualIncomeTax(monthlyPreTaxProfit * MONTHS_PER_YEAR) / MONTHS_PER_YEAR;

const CAP_ENDS_AT =
  (MARGINAL_CAP_RATE * EXEMPT_INCOME) / (MARGINAL_CAP_RATE - INCOME_TAX_RATE);

const afterTaxAt = (taxableIncome: number) =>
  taxableIncome - annualIncomeTax(taxableIncome);

export const monthlyPreTaxProfitFor = (
  monthlyAfterTaxProfit: number,
): number => {
  const afterTax = monthlyAfterTaxProfit * MONTHS_PER_YEAR;

  const preTax =
    afterTax <= EXEMPT_INCOME
      ? afterTax
      : afterTax <= afterTaxAt(CAP_ENDS_AT)
        ? (afterTax - MARGINAL_CAP_RATE * EXEMPT_INCOME) /
          (1 - MARGINAL_CAP_RATE)
        : afterTax / (1 - INCOME_TAX_RATE);

  return preTax / MONTHS_PER_YEAR;
};
