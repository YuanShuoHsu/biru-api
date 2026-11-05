import { Inject, Injectable } from '@nestjs/common';

import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm';

import { attendanceEmployee } from '../db/schema/attendance.js';
import { organization } from '../db/schema/organizations.js';
import {
  type PayrollSnapshot,
  payrollStatement,
} from '../db/schema/payroll.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { organizationNotFoundError } from '../common/utils/organizations.js';

import { payrollPeriod } from '../payroll/payroll-calculation.js';

import type {
  PersonnelCostReportResponseDto,
  PersonnelCostReportTotalsDto,
} from './dto/personnel-cost-report.dto.js';

interface Accumulator {
  employerInsurance: bigint;
  employerPension: bigint;
  gross: bigint;
  headcount: number;
  missingEmployerInsurance: number;
}

const emptyAccumulator = (): Accumulator => ({
  employerInsurance: 0n,
  employerPension: 0n,
  gross: 0n,
  headcount: 0,
  missingEmployerInsurance: 0,
});

const accumulate = (target: Accumulator, snapshot: PayrollSnapshot) => {
  target.employerInsurance += (snapshot.employerCosts ?? []).reduce(
    (sum, { amountCents }) => sum + BigInt(amountCents),
    0n,
  );
  target.employerPension += BigInt(snapshot.employerPensionCents);
  target.gross += BigInt(snapshot.grossCents);
  target.headcount += 1;
  if (!snapshot.employerCosts) target.missingEmployerInsurance += 1;
};

const toTotals = ({
  employerInsurance,
  employerPension,
  gross,
  headcount,
  missingEmployerInsurance,
}: Accumulator): PersonnelCostReportTotalsDto => ({
  employerInsuranceCents:
    headcount > 0 && missingEmployerInsurance === headcount
      ? null
      : employerInsurance.toString(),
  employerPensionCents: employerPension.toString(),
  grossCents: gross.toString(),
  headcount,
  missingEmployerInsurance,
  totalCents: (gross + employerInsurance + employerPension).toString(),
});

@Injectable()
export class PersonnelCostReportService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getPersonnelCostReport(
    organizationSlug: string,
    month: string,
  ): Promise<PersonnelCostReportResponseDto> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw organizationNotFoundError();

    const { start, end } = payrollPeriod(month);

    const [statements, employees] = await Promise.all([
      this.db
        .select({
          employeeId: payrollStatement.employeeId,
          jobTitle: attendanceEmployee.jobTitle,
          snapshot: payrollStatement.snapshot,
        })
        .from(payrollStatement)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, payrollStatement.employeeId),
        )
        .where(
          and(
            eq(payrollStatement.organizationId, org.id),
            eq(payrollStatement.status, 'published'),
            eq(payrollStatement.month, month),
          ),
        )
        .orderBy(asc(attendanceEmployee.jobTitle)),
      this.db
        .select({ id: attendanceEmployee.id })
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.organizationId, org.id),
            lt(attendanceEmployee.hiredAt, end),
            or(
              isNull(attendanceEmployee.terminatedAt),
              gt(attendanceEmployee.terminatedAt, start),
            ),
          ),
        ),
    ]);

    const groups = new Map<string | null, Accumulator>();
    const totals = emptyAccumulator();

    for (const { jobTitle, snapshot } of statements) {
      const group = groups.get(jobTitle) ?? emptyAccumulator();
      groups.set(jobTitle, group);
      accumulate(group, snapshot);
      accumulate(totals, snapshot);
    }

    const publishedEmployeeIds = new Set(
      statements.map(({ employeeId }) => employeeId),
    );

    return {
      month,
      rows: [...groups].map(([jobTitle, group]) => ({
        jobTitle,
        ...toTotals(group),
      })),
      totals: toTotals(totals),
      unpublishedEmployees: employees.filter(
        ({ id }) => !publishedEmployeeIds.has(id),
      ).length,
    };
  }
}
