import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { PayrollRulesService } from './payroll-rules.service';
import { PayrollService } from './payroll.service';
import { taiwan2026 } from './taiwan-rules.fixture';

const actor = { organizationId: 'org', userId: 'owner', role: 'owner' };
const scheduledWeeks = (weeklyMinutes: number, before: Date) =>
  Array.from({ length: 52 * 5 }, (_, index) => {
    const startsAt = new Date(
      before.getTime() -
        (Math.floor(index / 5) + 1) * 7 * 86400000 +
        (index % 5) * 86400000,
    );
    return {
      employeeId: 'employee',
      startsAt,
      endsAt: new Date(startsAt.getTime() + (weeklyMinutes / 5) * 60000),
      paidBreak: false,
      breakStartsAt: null,
      breakEndsAt: null,
    };
  });
const employee = {
  id: 'employee',
  organizationId: 'org',
  userId: 'staff',
  name: 'Staff',
};

const row = {
  id: 'statement',
  employeeId: 'employee',
  month: '2026-02',
  status: 'draft',
  createdBy: 'drafter',
  snapshot: {
    sourceFingerprint: 'original',
    blockers: [],
    ruleVersion: 'TW-general-2026-2',
  },
};

function setup(results: unknown[][], current = row.snapshot) {
  const select = jest.fn(() => {
    const promise = Promise.resolve(results.shift() ?? []);
    const query: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit'])
      query[method] = () => query;
    return query;
  });
  const update = jest.fn(() => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([{ ...row, status: 'reviewed' }]),
      }),
    }),
  }));
  const db = {
    select,
    update,
    execute: jest.fn(),
    insert: jest.fn(() => ({ values: jest.fn() })),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  const service = new PayrollService(
    db as unknown as DrizzleDB,
    {} as PayrollRulesService,
  );
  const snapshot = jest.fn(() => Promise.resolve(current));
  Object.defineProperty(service, 'snapshot', { value: snapshot });
  return { service, update, snapshot };
}

describe('Payroll review and publication', () => {
  it('does not publish a draft without review', async () => {
    const { service, update } = setup([[row], [employee], [{ id: row.id }]]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).rejects.toThrow('invalidPayrollState');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects changed source data after a draft was created', async () => {
    const { service, update } = setup([[row], [employee], [{ id: row.id }]], {
      ...row.snapshot,
      sourceFingerprint: 'changed',
    });
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('payrollSourceChanged');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects a draft calculated under an older rule version', async () => {
    const { service, update } = setup([
      [
        {
          ...row,
          snapshot: { ...row.snapshot, ruleVersion: 'TW-general-2026-1' },
        },
      ],
      [employee],
      [{ id: row.id }],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('payrollSourceChanged');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects an older draft version', async () => {
    const { service, update } = setup([[row], [employee], [{ id: 'newer' }]]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('payrollSourceChanged');
    expect(update).not.toHaveBeenCalled();
  });
  it('does not write a duplicate publication on retry', async () => {
    const published = { ...row, status: 'published' };
    const { service, update, snapshot } = setup([[published]]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).resolves.toEqual(published);
    expect(update).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });
  it('refuses to review the reviewer own payslip', async () => {
    const { service, update } = setup([
      [row],
      [{ ...employee, userId: 'owner' }],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('cannotReviewSelf');
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses to publish the publisher own payslip', async () => {
    const reviewed = { ...row, status: 'reviewed' };
    const { service, update } = setup([
      [reviewed],
      [{ ...employee, userId: 'owner' }],
    ]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).rejects.toThrow('cannotReviewSelf');
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses to review a draft the reviewer created', async () => {
    const { service, update } = setup([
      [{ ...row, createdBy: 'owner' }],
      [employee],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('cannotReviewOwnDraft');
    expect(update).not.toHaveBeenCalled();
  });
  it('lets the drafter publish a payslip someone else reviewed', async () => {
    const reviewed = { ...row, status: 'reviewed', createdBy: 'owner' };
    const { service, update } = setup([
      [reviewed],
      [employee],
      [{ id: row.id }],
    ]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).resolves.toHaveProperty('status', 'reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('reviews a current draft with no blockers', async () => {
    const { service, update } = setup([[row], [employee], [{ id: row.id }]]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).resolves.toHaveProperty('status', 'reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('Payroll terms validation', () => {
  const insurance = {
    laborCoverage: 'both' as const,
    laborBasis: 29500,
    healthBasis: 29500,
    healthDependents: 0,
    pensionBasis: 29500,
    voluntaryPercent: 0,
    employerPercent: 6,
    taxMethod: 'resident5' as const,
  };
  const dto = {
    employeeId: 'employee',
    effectiveFrom: '2026-03-01',
    salaryType: 'hourly' as const,
    salaryCents: '20000',
    laborInsuranceCents: '0',
    healthInsuranceCents: '0',
    voluntaryPensionCents: '0',
    employerPensionCents: '0',
    withholdingCents: '0',
    allowanceCents: '0',
    otherDeductionCents: '0',
    sourceNote: 'contract',
  };
  const save = (weeklyMinutes: number, overrides: object) => {
    const { service } = setup([
      [{ ...employee, hiredAt: new Date('2020-01-01T00:00:00+08:00') }],
      scheduledWeeks(weeklyMinutes, new Date('2026-03-01T00:00:00+08:00')),
    ]);
    Object.defineProperty(service, 'ruleSets', {
      value: {
        resolve: () => Promise.resolve({ rules: taiwan2026, unconfirmed: [] }),
      },
    });
    return service.saveTerms(actor, {
      ...dto,
      insurance: { ...insurance, ...overrides },
    });
  };
  it('rejects a basis that is not an exact grade of the ladder', async () => {
    await expect(save(2400, { laborBasis: 30000 })).rejects.toThrow(
      'invalidInsuranceBasis',
    );
    await expect(save(2400, { healthBasis: 50000 })).rejects.toThrow(
      'invalidInsuranceBasis',
    );
  });
  it('allows the part-time labor ladder only for part-time staff', async () => {
    await expect(
      save(2400, { laborLadder: 'partTime', laborBasis: 11100 }),
    ).rejects.toThrow('partTimeLadderRequiresPartTime');
    await expect(save(1200, { laborBasis: 11100 })).rejects.toThrow(
      'invalidInsuranceBasis',
    );
  });
  it('does not change terms a published payslip was calculated from', async () => {
    const { service } = setup([
      [employee],
      [{ effectiveFrom: new Date('2026-06-01T00:00:00+08:00') }],
      [{ id: 'statement' }],
    ]);
    const insert = jest.spyOn(
      Reflect.get(service, 'db') as { insert: () => unknown },
      'insert',
    );
    await expect(service.saveTerms(actor, dto)).rejects.toThrow(
      'payrollLocked',
    );
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('Reopening a published payslip', () => {
  const published = { ...row, status: 'published', reopenedAt: null };
  it('reopens a published payslip so its month can change again', async () => {
    const { service, update } = setup([[published], [employee]]);
    await service.reopen(actor, row.id, 'late overtime approval');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('only reopens published payslips', async () => {
    const { service, update } = setup([[{ ...published, status: 'reviewed' }]]);
    await expect(service.reopen(actor, row.id, 'fix')).rejects.toThrow(
      'invalidPayrollState',
    );
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses to reopen the actor own payslip', async () => {
    const { service, update } = setup([
      [published],
      [{ ...employee, userId: 'owner' }],
    ]);
    await expect(service.reopen(actor, row.id, 'fix')).rejects.toThrow(
      'cannotReviewSelf',
    );
    expect(update).not.toHaveBeenCalled();
  });
  it('does not reopen twice', async () => {
    const reopened = { ...published, reopenedAt: new Date() };
    const { service, update } = setup([[reopened]]);
    await expect(service.reopen(actor, row.id, 'fix')).resolves.toBe(reopened);
    expect(update).not.toHaveBeenCalled();
  });
  it('does not draft a new version while the month is still closed', async () => {
    const { service, snapshot } = setup([[], [employee], [{ id: row.id }]]);
    await expect(
      service.draft(actor, {
        idempotencyKey: 'key',
        employeeId: 'employee',
        month: '2026-02',
        reason: 'redo',
      }),
    ).rejects.toThrow('payrollLocked');
    expect(snapshot).not.toHaveBeenCalled();
  });
});
