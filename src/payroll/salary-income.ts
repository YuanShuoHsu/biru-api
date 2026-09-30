import type { PayrollLineCode, PayrollSnapshot } from 'src/db/schema/payroll';

import { MEAL_ALLOWANCE_EXEMPT_CENTS } from './taiwan-rules';

// 所得稅法 §14 I 3：規定時數內加班費與伙食費免稅額不屬薪資收入；職災補償免稅；資遣費與預告工資是退職所得另列格式 93；自提勞退不計入薪資課稅
const EXCLUDED_CODES: readonly PayrollLineCode[] = [
  'overtimePay',
  'holidayPay',
  'injuryCompensation',
  'severancePay',
  'noticePay',
  'voluntaryPension',
];

export const lineCents = (snapshot: PayrollSnapshot, code: PayrollLineCode) =>
  snapshot.lines
    .filter((line) => line.code === code)
    .reduce((sum, line) => sum + BigInt(line.amountCents), 0n);

export const salaryIncomeCents = (snapshot: PayrollSnapshot) => {
  const meal = lineCents(snapshot, 'mealAllowance');
  return (
    BigInt(snapshot.grossCents) -
    EXCLUDED_CODES.reduce((sum, code) => sum + lineCents(snapshot, code), 0n) -
    (meal < MEAL_ALLOWANCE_EXEMPT_CENTS ? meal : MEAL_ALLOWANCE_EXEMPT_CENTS)
  );
};
