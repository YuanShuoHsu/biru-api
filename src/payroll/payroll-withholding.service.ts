import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { and, asc, eq, gte, lt } from 'drizzle-orm';

import type { AttendanceActor } from 'src/attendance/attendance-actor';
import { lockOrganization, writeAudit } from 'src/attendance/attendance-audit';
import {
  badRequestError,
  conflictError,
} from 'src/attendance/attendance-errors';
import {
  DAY_MS,
  platformDateString,
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import { decryptField, encryptField } from 'src/common/utils/field-encryption';
import {
  attendanceEmployee,
  type AttendanceLegalStatus,
} from 'src/db/schema/attendance';
import {
  payrollCertificateRequest,
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
  WithholdingIdType,
} from './dto/payroll-withholding.dto';
import { lineCents, salaryIncomeCents } from './salary-income';
import {
  isValidBusinessNumber,
  isValidNationalId,
  isValidPassportDerivedId,
  isValidResidentCertificateId,
  maskTaxId,
} from './tax-ids';
import {
  buildWithholdingFile,
  type WithholdingFileRecord,
} from './withholding-file';

// 所得稅法 §92 II：非居住者應於代扣稅款之日起 10 日內申報，給付當日算第 1 日
const NON_RESIDENT_FILING_DAYS = 10;

interface Statement {
  employeeId: string;
  month: string;
  paymentDate: string;
  snapshot: PayrollSnapshot;
}

interface Identity {
  taxId: string;
  address: string;
  residenceCountryCode: string | null;
  foreignTaxId: string | null;
}

const toDollars = (cents: bigint) => (cents + 50n) / 100n;

const idTypeOf = (
  legalStatus: AttendanceLegalStatus,
  nonResident: boolean,
): WithholdingIdType =>
  legalStatus === 'national' ? '0' : nonResident ? '7' : '3';

// 證號別 3 必須是居留證統一證號；證號別 7 另可用護照衍生碼（存檔時已依出生日驗過）
const identityComplete = (idType: WithholdingIdType, identity?: Identity) =>
  !!identity &&
  (idType === '0'
    ? isValidNationalId(identity.taxId)
    : (idType === '7' || isValidResidentCertificateId(identity.taxId)) &&
      !!identity.residenceCountryCode &&
      !!identity.foreignTaxId);

const certificateOf = (statements: Statement[]) => {
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

type Certificate = ReturnType<typeof certificateOf>;

const stringifyCertificate = (certificate: Certificate) => ({
  ...certificate,
  salaryCents: certificate.salaryCents.toString(),
  salaryWithholdingCents: certificate.salaryWithholdingCents.toString(),
  voluntaryPensionCents: certificate.voluntaryPensionCents.toString(),
  retirementIncomeCents: certificate.retirementIncomeCents.toString(),
  retirementWithholdingCents: certificate.retirementWithholdingCents.toString(),
});

const fileRecords = (
  base: Omit<
    WithholdingFileRecord,
    'format' | 'totalDollars' | 'taxDollars' | 'pensionDollars'
  >,
  certificate: Certificate,
) => {
  const records: WithholdingFileRecord[] = [];
  if (certificate.salaryCents > 0n || certificate.salaryWithholdingCents > 0n)
    records.push({
      ...base,
      format: '50',
      totalDollars: toDollars(certificate.salaryCents),
      taxDollars: toDollars(certificate.salaryWithholdingCents),
      pensionDollars: toDollars(certificate.voluntaryPensionCents),
    });
  if (certificate.retirementIncomeCents > 0n)
    records.push({
      ...base,
      format: '93',
      totalDollars: toDollars(certificate.retirementIncomeCents),
      taxDollars: toDollars(certificate.retirementWithholdingCents),
      pensionDollars: 0n,
    });
  return records;
};

const isNonResident = ({ snapshot }: Statement) => !!snapshot.nonResident;

const filingDeadline = (paymentDate: string) =>
  platformDateString(
    new Date(
      Date.parse(`${paymentDate}T00:00:00+08:00`) +
        (NON_RESIDENT_FILING_DAYS - 1) * DAY_MS,
    ),
  );

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
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [employee] = await tx
        .select({
          legalStatus: attendanceEmployee.legalStatus,
          birthDate: attendanceEmployee.birthDate,
        })
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.id, employeeId),
            eq(attendanceEmployee.organizationId, actor.organizationId),
          ),
        );
      if (!employee) throw new NotFoundException();
      const national = employee.legalStatus === 'national';
      if (
        national
          ? !isValidNationalId(dto.taxId)
          : !isValidResidentCertificateId(dto.taxId) &&
            !(
              employee.birthDate &&
              isValidPassportDerivedId(dto.taxId, employee.birthDate)
            )
      )
        throw badRequestError('invalidTaxId');
      if (!national && (!dto.residenceCountryCode || !dto.foreignTaxId))
        throw badRequestError('foreignTaxIdentityRequired');
      const values = {
        encryptedTaxId: encryptField(dto.taxId),
        encryptedAddress: encryptField(dto.address.trim()),
        residenceCountryCode: national ? null : dto.residenceCountryCode!,
        encryptedForeignTaxId: national
          ? null
          : encryptField(dto.foreignTaxId!.toUpperCase()),
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

  async requestCertificate(actor: AttendanceActor, year: number) {
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select({ id: attendanceEmployee.id })
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            eq(attendanceEmployee.userId, actor.userId),
          ),
        );
      if (!employee) throw new NotFoundException();
      await tx
        .insert(payrollCertificateRequest)
        .values({
          employeeId: employee.id,
          year,
          organizationId: actor.organizationId,
        })
        .onConflictDoNothing();
      await writeAudit(tx, actor, 'payroll.certificate.request', employee.id, {
        year,
      });
      return { id: employee.id };
    });
  }

  private async statements(
    organizationId: string,
    fromDate: string,
    toDate: string,
    employeeId?: string,
  ): Promise<Statement[]> {
    return (
      await this.db
        .select({
          employeeId: payrollStatement.employeeId,
          month: payrollStatement.month,
          snapshot: payrollStatement.snapshot,
          paidOn: payrollStatement.paidOn,
        })
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.organizationId, organizationId),
            eq(payrollStatement.status, 'published'),
            employeeId
              ? eq(payrollStatement.employeeId, employeeId)
              : undefined,
            gte(payrollStatement.paidOn, fromDate),
            lt(payrollStatement.paidOn, toDate),
          ),
        )
        .orderBy(asc(payrollStatement.month))
    ).map(({ paidOn, ...statement }) => ({
      ...statement,
      paymentDate: paidOn!,
    }));
  }

  private async people(organizationId: string) {
    const [employees, identities, requests] = await Promise.all([
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
      this.db
        .select()
        .from(payrollCertificateRequest)
        .where(eq(payrollCertificateRequest.organizationId, organizationId)),
    ]);
    const identityOf = (employeeId: string): Identity | undefined => {
      const row = identities.find((item) => item.employeeId === employeeId);
      return (
        row && {
          taxId: decryptField(row.encryptedTaxId),
          address: decryptField(row.encryptedAddress),
          residenceCountryCode: row.residenceCountryCode,
          foreignTaxId:
            row.encryptedForeignTaxId &&
            decryptField(row.encryptedForeignTaxId),
        }
      );
    };
    const requested = (employeeId: string, year: number) =>
      requests.some(
        (request) => request.employeeId === employeeId && request.year === year,
      );
    return { employees, identityOf, requested };
  }

  private async annualRows(organizationId: string, year: number) {
    const [statements, { employees, identityOf, requested }] =
      await Promise.all([
        this.statements(organizationId, `${year}-01-01`, `${year + 1}-01-01`),
        this.people(organizationId),
      ]);
    const residentRows = employees
      .map((employee) => ({
        employee,
        identity: identityOf(employee.id),
        idType: idTypeOf(employee.legalStatus, false),
        requested: requested(employee.id, year),
        statements: statements.filter(
          (statement) =>
            statement.employeeId === employee.id && !isNonResident(statement),
        ),
      }))
      .filter(({ statements: owned }) => owned.length)
      .map((row) => ({ ...row, certificate: certificateOf(row.statements) }))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
    const nonResidentRows = statements
      .filter(isNonResident)
      .map((statement) => {
        const employee = employees.find(
          ({ id }) => id === statement.employeeId,
        )!;
        return {
          employee,
          identity: identityOf(employee.id),
          statement,
          certificate: certificateOf([statement]),
        };
      });
    return { residentRows, nonResidentRows };
  }

  async summary(actor: AttendanceActor, year: number) {
    const [unit, { residentRows, nonResidentRows }] = await Promise.all([
      this.unitOf(actor.organizationId),
      this.annualRows(actor.organizationId, year),
    ]);
    return {
      year,
      unit,
      certificates: residentRows.map(
        ({ certificate, employee, identity, idType, requested }) => ({
          employeeId: employee.id,
          employeeName: employee.name,
          legalStatus: employee.legalStatus,
          idType,
          taxIdMasked: identity ? maskTaxId(identity.taxId) : null,
          identityComplete: identityComplete(idType, identity),
          certificateRequested: requested,
          ...stringifyCertificate(certificate),
        }),
      ),
      nonResidentPayments: nonResidentRows.map(
        ({ certificate, employee, identity, statement }) => {
          const {
            salaryCents,
            salaryWithholdingCents,
            retirementIncomeCents,
            retirementWithholdingCents,
          } = stringifyCertificate(certificate);
          return {
            paymentDate: statement.paymentDate,
            deadline: filingDeadline(statement.paymentDate),
            employeeId: employee.id,
            employeeName: employee.name,
            taxIdMasked: identity ? maskTaxId(identity.taxId) : null,
            identityComplete: identityComplete('7', identity),
            salaryCents,
            salaryWithholdingCents,
            retirementIncomeCents,
            retirementWithholdingCents,
          };
        },
      ),
    };
  }

  async file(actor: AttendanceActor, year: number) {
    const [unit, { residentRows }] = await Promise.all([
      this.unitOf(actor.organizationId),
      this.annualRows(actor.organizationId, year),
    ]);
    if (!unit) throw conflictError('withholdingUnitRequired');
    if (
      residentRows.some(
        ({ idType, identity }) => !identityComplete(idType, identity),
      )
    )
      throw conflictError('taxIdentityRequired');
    const createdAt = new Date();
    // 免填發限於如期申報且所得人未要求；逾 1 月底才產生的申報檔一律改為填發
    const late = createdAt >= platformMonthStart(year + 1, 1);
    const records = residentRows.flatMap(
      ({ certificate, employee, identity, idType, requested }) =>
        fileRecords(
          {
            idType,
            issuance: requested || late ? '2' : '1',
            residenceCountryCode: identity!.residenceCountryCode,
            foreignTaxId: identity!.foreignTaxId,
            taxId: identity!.taxId,
            name: employee.name,
            address: identity!.address,
            periodFrom: certificate.periodFrom,
            periodTo: certificate.periodTo,
          },
          certificate,
        ),
    );
    return buildWithholdingFile(
      unit,
      { kind: 'annual', year },
      records,
      createdAt,
    );
  }

  async nonResidentFile(actor: AttendanceActor, paymentDate: string) {
    const from = new Date(`${paymentDate}T00:00:00+08:00`);
    const [unit, statements, { employees, identityOf }] = await Promise.all([
      this.unitOf(actor.organizationId),
      this.statements(
        actor.organizationId,
        paymentDate,
        platformDateString(new Date(from.getTime() + DAY_MS)),
      ),
      this.people(actor.organizationId),
    ]);
    if (!unit) throw conflictError('withholdingUnitRequired');
    const paid = statements.filter(isNonResident);
    if (!paid.length) throw new NotFoundException();
    if (
      paid.some(
        ({ employeeId }) => !identityComplete('7', identityOf(employeeId)),
      )
    )
      throw conflictError('taxIdentityRequired');
    const records = paid.flatMap((statement) => {
      const employee = employees.find(({ id }) => id === statement.employeeId)!;
      const identity = identityOf(employee.id)!;
      const certificate = certificateOf([statement]);
      return fileRecords(
        {
          idType: '7',
          issuance: '2',
          residenceCountryCode: identity.residenceCountryCode,
          foreignTaxId: identity.foreignTaxId,
          taxId: identity.taxId,
          name: employee.name,
          address: identity.address,
          periodFrom: certificate.periodFrom,
          periodTo: certificate.periodTo,
        },
        certificate,
      );
    });
    return buildWithholdingFile(
      unit,
      { kind: 'nonResident', paymentDate },
      records,
      new Date(),
    );
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
    if (!employee || !unit) return [];
    const { identityOf, requested } = await this.people(actor.organizationId);
    const identity = identityOf(employee.id);
    if (!identity) return [];
    const currentYear = toPlatformTime(new Date()).getUTCFullYear();
    const statements = await this.statements(
      actor.organizationId,
      '',
      platformDateString(new Date(Date.now() + DAY_MS)),
      employee.id,
    );
    const { businessNumber, name, address, agentName } = unit;
    const base = {
      unit: { businessNumber, name, address, agentName },
      employeeName: employee.name,
      taxId: identity.taxId,
      address: identity.address,
    };
    const residentYears = [
      ...new Set(
        statements
          .filter((statement) => !isNonResident(statement))
          .map(({ paymentDate }) => Number(paymentDate.slice(0, 4)))
          .filter((year) => year < currentYear),
      ),
    ];
    return [
      ...residentYears.map((year) => ({
        ...base,
        kind: 'annual' as const,
        idType: idTypeOf(employee.legalStatus, false),
        year,
        paymentDate: null,
        requested: requested(employee.id, year),
        ...stringifyCertificate(
          certificateOf(
            statements.filter(
              (statement) =>
                !isNonResident(statement) &&
                statement.paymentDate.startsWith(String(year)),
            ),
          ),
        ),
      })),
      ...statements.filter(isNonResident).map((statement) => ({
        ...base,
        kind: 'nonResident' as const,
        idType: '7' as const,
        year: Number(statement.paymentDate.slice(0, 4)),
        paymentDate: statement.paymentDate,
        requested: true,
        ...stringifyCertificate(certificateOf([statement])),
      })),
    ].sort((a, b) =>
      (b.paymentDate ?? `${b.year}-12-31`).localeCompare(
        a.paymentDate ?? `${a.year}-12-31`,
      ),
    );
  }
}
