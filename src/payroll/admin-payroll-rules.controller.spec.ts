import { AdminPayrollRulesController } from './admin-payroll-rules.controller.js';
import type { PayrollRulesService } from './payroll-rules.service.js';

describe('AdminPayrollRulesController', () => {
  it('同步規則集後也同步國定假日，並回傳寫入的年度', async () => {
    const calls: string[] = [];
    const service = {
      ingest: vi.fn(() => {
        calls.push('ingest');
        return Promise.resolve({
          written: ['2027-01'],
          skipped: [],
          rejected: [],
          checked: true,
        });
      }),
      ingestHolidays: vi.fn(() => {
        calls.push('ingestHolidays');
        return Promise.resolve({ written: [2026, 2027] });
      }),
    };
    const controller = new AdminPayrollRulesController(
      service as unknown as PayrollRulesService,
    );

    await expect(controller.ingest()).resolves.toEqual({
      written: ['2027-01'],
      skipped: [],
      rejected: [],
      checked: true,
      holidayYears: [2026, 2027],
    });
    expect(calls).toEqual(['ingest', 'ingestHolidays']);
  });
});
