import { NotFoundException } from '@nestjs/common';

import type { AttendanceActor } from '../attendance/attendance-actor.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { PayrollWithholdingService } from './payroll-withholding.service.js';

describe('PayrollWithholdingService.nonResidentFile', () => {
  it('answers a date without non-resident payments with its own not found code', async () => {
    const service = new PayrollWithholdingService({} as DrizzleDB);
    const internals = service as unknown as Record<string, unknown>;
    internals.unitOf = vi.fn().mockResolvedValue({ id: 'unit' });
    internals.statements = vi.fn().mockResolvedValue([]);
    internals.people = vi
      .fn()
      .mockResolvedValue({ employees: [], identityOf: () => undefined });

    const error: unknown = await service
      .nonResidentFile(
        { organizationId: 'org' } as AttendanceActor,
        '2026-11-05',
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'nonResidentPaymentNotFound',
    });
  });
});
