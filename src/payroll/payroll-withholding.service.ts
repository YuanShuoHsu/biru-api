import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { and, asc, eq, gte, lt } from 'drizzle-orm';

import type { AttendanceActor } from 'src/attendance/attendance-actor';
import { lockOrganization, writeAudit } from 'src/attendance/attendance-audit';
import {
  badRequestError,
  conflictError,
} from 'src/attendance/attendance-errors';
import {
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import { decryptField, encryptField } from 'src/common/utils/field-encryption';
import { attendanceEmployee } from 'src/db/schema/attendance';
import {
  payrollStatement,
  payrollTaxIdentity,
  payrollWithholdingUnit,
  type PayrollSnapshot,
} from 'src/db/schema/payroll';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type {
  PayrollTaxIdentityDto,
  PayrollWithholdingUnitDto,
} from './dto/payroll-withholding.dto';
import { lineCents, salaryIncomeCents } from './salary-income';
import { isValidBusinessNumber, isValidNationalId, maskTaxId } from './tax-ids';
import {
  buildWithholdingFile,
  type WithholdingFileRecord,
} from './withholding-file';

const toDollars = (cents: bigint) => (cents + 50n) / 100n;

const certificateOf = (
  statements: { month: string; snapshot: PayrollSnapshot }[],
) => {
  const sum = (pick: (snapshot: PayrollSnapshot) => bigint) =>
    statements.reduce((total, { snapshot }) => total + pick(snapshot), 0n);
  const months = statements.map(({ month }) => month).sort();
  return {
    periodFrom: months[0],
    periodTo: months.at(-1)!,
    salaryCents: sum(salaryIncomeCents),
    salaryWithholdingCents: sum((snapshot) =>
      lineCents(snapshot, 'withholding'),
    ),
    voluntaryPensionCents: sum((snapshot) =>
      lineCents(snapshot, 'voluntaryPension'),
    ),
    retirementIncomeCents: sum((snapshot) =>
      BigInt(snapshot.retirementIncomeCents ?? '0'),
    ),
    retirementWithholdingCents: sum((snapshot) =>
      lineCents(snapshot, 'retirementWithholding'),
    ),
  };
};

const stringifyCertificate = (
  certificate: ReturnType<typeof certificateOf>,
) => ({
  ...certificate,
  salaryCents: certificate.salaryCents.toString(),
  salaryWithholdingCents: certificate.salaryWithholdingCents.toString(),
  voluntaryPensionCents: certificate.voluntaryPensionCents.toString(),
  retirementIncomeCents: certificate.retirementIncomeCents.toString(),
  retirementWithholdingCents: certificate.retirementWithholdingCents.toString(),
});

@Injectable()
export class PayrollWithholdingService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  private async unitOf(organizationId: string) {
    const [unit] = await this.db
      .select({
        businessNumber: payrollWithholdingUnit.businessNumber,
        taxOfficeCode: payrollWithholdingUnit.taxOfficeCode,
        taxRegistrationNumber: payrollWithholdingUnit.taxRegistrationNumber,
        name: payrollWithholdingUnit.name,
        address: payrollWithholdingUnit.address,
        agentName: payrollWithholdingUnit.agentName,
        representativeName: payrollWithholdingUnit.representativeName,
        contactName: payrollWithholdingUnit.contactName,
        contactPhone: payrollWithholdingUnit.contactPhone,
        contactEmail: payrollWithholdingUnit.contactEmail,
      })
      .from(payrollWithholdingUnit)
      .where(eq(payrollWithholdingUnit.organizationId, organizationId));
    return unit ?? null;
  }

  async saveUnit(actor: AttendanceActor, dto: PayrollWithholdingUnitDto) {
    if (!isValidBusinessNumber(dto.businessNumber))
      throw badRequestError('invalidBusinessNumber');
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const values = { ...dto, updatedAt: new Date() };
      await tx
        .insert(payrollWithholdingUnit)
        .values({ organizationId: actor.organizationId, ...values })
        .onConflictDoUpdate({
          target: payrollWithholdingUnit.organizationId,
          set: values,
        });
      await writeAudit(
        tx,
        actor,
        'payroll.withholdingUnit.save',
        actor.organizationId,
        { ...dto },
      );
      return dto;
    });
  }

  async saveTaxIdentity(
    actor: AttendanceActor,
    employeeId: string,
    dto: PayrollTaxIdentityDto,
  ) {
    if (!isValidNationalId(dto.taxId)) throw badRequestError('invalidTaxId');
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [employee] = await tx
        .select({ legalStatus: attendanceEmployee.legalStatus })
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.id, employeeId),
            eq(attendanceEmployee.organizationId, actor.organizationId),
          ),
        );
      if (!employee) throw new NotFoundException();
      if (employee.legalStatus !== 'national')
        throw conflictError('taxIdentityUnsupported');
      const values = {
        encryptedTaxId: encryptField(dto.taxId),
        encryptedAddress: encryptField(dto.address.trim()),
        updatedAt: new Date(),
      };
      await tx
        .insert(payrollTaxIdentity)
        .values({ employeeId, organizationId: actor.organizationId, ...values })
        .onConflictDoUpdate({
          target: payrollTaxIdentity.employeeId,
          set: values,
        });
      // 稽核紀錄只留遮罩後的號碼，避免明文個資落進可被一般管理者查詢的紀錄
      await writeAudit(tx, actor, 'payroll.taxIdentity.save', employeeId, {
        taxId: maskTaxId(dto.taxId),
      });
      return { id: employeeId };
    });
  }

  private async yearStatements(
    organizationId: string,
    year: number,
    employeeId?: string,
  ) {
    return this.db
      .select({
        employeeId: payrollStatement.employeeId,
        month: payrollStatement.month,
        snapshot: payrollStatement.snapshot,
      })
      .from(payrollStatement)
      .where(
        and(
          eq(payrollStatement.organizationId, organizationId),
          eq(payrollStatement.status, 'published'),
          employeeId ? eq(payrollStatement.employeeId, employeeId) : undefined,
          gte(payrollStatement.publishedAt, platformMonthStart(year, 0)),
          lt(payrollStatement.publishedAt, platformMonthStart(year + 1, 0)),
        ),
      )
      .orderBy(asc(payrollStatement.month));
  }

  private async certificates(organizationId: string, year: number) {
    const [statements, employees, identities] = await Promise.all([
      this.yearStatements(organizationId, year),
      this.db
        .select({
          id: attendanceEmployee.id,
          name: user.name,
          legalStatus: attendanceEmployee.legalStatus,
        })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(eq(attendanceEmployee.organizationId, organizationId)),
      this.db
        .select()
        .from(payrollTaxIdentity)
        .where(eq(payrollTaxIdentity.organizationId, organizationId)),
    ]);
    return employees
      .filter(({ id }) =>
        statements.some(({ employeeId }) => employeeId === id),
      )
      .map((employee) => {
        const identity = identities.find(
          ({ employeeId }) => employeeId === employee.id,
        );
        return {
          employee,
          identity: identity && {
            taxId: decryptField(identity.encryptedTaxId),
            address: decryptField(identity.encryptedAddress),
          },
          certificate: certificateOf(
            statements.filter(({ employeeId }) => employeeId === employee.id),
          ),
        };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }

  async summary(actor: AttendanceActor, year: number) {
    const [unit, rows] = await Promise.all([
      this.unitOf(actor.organizationId),
      this.certificates(actor.organizationId, year),
    ]);
    return {
      year,
      unit,
      certificates: rows.map(({ employee, identity, certificate }) => ({
        employeeId: employee.id,
        employeeName: employee.name,
        legalStatus: employee.legalStatus,
        filable: employee.legalStatus === 'national',
        taxIdMasked: identity ? maskTaxId(identity.taxId) : null,
        addressProvided: !!identity?.address,
        ...stringifyCertificate(certificate),
      })),
    };
  }

  async file(actor: AttendanceActor, year: number) {
    const [unit, rows] = await Promise.all([
      this.unitOf(actor.organizationId),
      this.certificates(actor.organizationId, year),
    ]);
    if (!unit) throw conflictError('withholdingUnitRequired');
    const filable = rows.filter(
      ({ employee }) => employee.legalStatus === 'national',
    );
    if (filable.some(({ identity }) => !identity))
      throw conflictError('taxIdentityRequired');
    const records = filable.flatMap(({ employee, identity, certificate }) => {
      const base = {
        taxId: identity!.taxId,
        name: employee.name,
        address: identity!.address,
        periodFrom: certificate.periodFrom,
        periodTo: certificate.periodTo,
      };
      const result: WithholdingFileRecord[] = [];
      if (
        certificate.salaryCents > 0n ||
        certificate.salaryWithholdingCents > 0n
      )
        result.push({
          ...base,
          format: '50',
          totalDollars: toDollars(certificate.salaryCents),
          taxDollars: toDollars(certificate.salaryWithholdingCents),
          pensionDollars: toDollars(certificate.voluntaryPensionCents),
        });
      if (certificate.retirementIncomeCents > 0n)
        result.push({
          ...base,
          format: '93',
          totalDollars: toDollars(certificate.retirementIncomeCents),
          taxDollars: toDollars(certificate.retirementWithholdingCents),
          pensionDollars: 0n,
        });
      return result;
    });
    return buildWithholdingFile(unit, year, records, new Date());
  }

  async mine(actor: AttendanceActor) {
    const [employee] = await this.db
      .select({
        id: attendanceEmployee.id,
        name: user.name,
        legalStatus: attendanceEmployee.legalStatus,
      })
      .from(attendanceEmployee)
      .innerJoin(user, eq(user.id, attendanceEmployee.userId))
      .where(
        and(
          eq(attendanceEmployee.organizationId, actor.organizationId),
          eq(attendanceEmployee.userId, actor.userId),
        ),
      );
    const unit = await this.unitOf(actor.organizationId);
    if (!employee || !unit || employee.legalStatus !== 'national') return [];
    const [identity] = await this.db
      .select()
      .from(payrollTaxIdentity)
      .where(eq(payrollTaxIdentity.employeeId, employee.id));
    if (!identity) return [];
    const currentYear = toPlatformTime(new Date()).getUTCFullYear();
    const statements = await this.db
      .select({
        month: payrollStatement.month,
        snapshot: payrollStatement.snapshot,
        publishedAt: payrollStatement.publishedAt,
      })
      .from(payrollStatement)
      .where(
        and(
          eq(payrollStatement.employeeId, employee.id),
          eq(payrollStatement.status, 'published'),
          lt(payrollStatement.publishedAt, platformMonthStart(currentYear, 0)),
        ),
      )
      .orderBy(asc(payrollStatement.month));
    const yearOf = (date: Date) => toPlatformTime(date).getUTCFullYear();
    const years = [
      ...new Set(statements.map(({ publishedAt }) => yearOf(publishedAt!))),
    ].sort((a, b) => b - a);
    const { businessNumber, name, address, agentName } = unit;
    return years.map((year) => ({
      year,
      unit: { businessNumber, name, address, agentName },
      employeeName: employee.name,
      taxId: decryptField(identity.encryptedTaxId),
      address: decryptField(identity.encryptedAddress),
      ...stringifyCertificate(
        certificateOf(
          statements.filter(({ publishedAt }) => yearOf(publishedAt!) === year),
        ),
      ),
    }));
  }
}
