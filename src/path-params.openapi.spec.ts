import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { AttendanceEmployeesController } from './attendance/attendance-employees.controller.js';
import { AttendanceLeavesController } from './attendance/attendance-leaves.controller.js';
import { AttendanceParentalController } from './attendance/attendance-parental.controller.js';
import { AttendanceRequestsController } from './attendance/attendance-requests.controller.js';
import { AttendanceShiftTypesController } from './attendance/attendance-shift-types.controller.js';
import { AttendanceShiftsController } from './attendance/attendance-shifts.controller.js';
import { AuditController } from './audit/audit.controller.js';
import { CashDevicesController } from './cash-devices/cash-devices.controller.js';
import { ChecklistRunsController } from './checklists/checklist-runs.controller.js';
import { ChecklistTemplatesController } from './checklists/checklist-templates.controller.js';
import { OrganizationDeletedRecordsController } from './deleted-records/organization-deleted-records.controller.js';
import { OrganizationInventoryController } from './inventory/organization-inventory.controller.js';
import { OperatingCostsController } from './operating-costs/operating-costs.controller.js';
import { OrganizationsController } from './organizations/organizations.controller.js';
import { PayrollEarningsController } from './payroll/payroll-earnings.controller.js';
import { PayrollWithholdingController } from './payroll/payroll-withholding.controller.js';
import { PayrollController } from './payroll/payroll.controller.js';
import { OrganizationPointsController } from './points/organization-points.controller.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('path parameters OpenAPI', () => {
  let document: ReturnType<typeof SwaggerModule.createDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AttendanceEmployeesController,
        AttendanceLeavesController,
        AttendanceParentalController,
        AttendanceRequestsController,
        AttendanceShiftTypesController,
        AttendanceShiftsController,
        AuditController,
        CashDevicesController,
        ChecklistRunsController,
        ChecklistTemplatesController,
        OperatingCostsController,
        OrganizationDeletedRecordsController,
        OrganizationInventoryController,
        OrganizationPointsController,
        OrganizationsController,
        PayrollController,
        PayrollEarningsController,
        PayrollWithholdingController,
      ],
    })
      .useMocker(() => ({}))
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.close();
  });

  it('declares every path template parameter as a path parameter', () => {
    const missing = Object.entries(document.paths).flatMap(([path, item]) =>
      METHODS.flatMap((method) => {
        const operation = item[method];
        if (!operation) return [];
        const declared = new Set(
          (operation.parameters ?? []).flatMap((parameter) =>
            'in' in parameter && parameter.in === 'path'
              ? [parameter.name]
              : [],
          ),
        );
        return [...path.matchAll(/\{([^}]+)\}/g)]
          .map(([, name]) => name)
          .filter((name) => !declared.has(name))
          .map((name) => `${method.toUpperCase()} ${path} ${name}`);
      }),
    );
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('documents every organizationSlug path parameter as a string', () => {
    const untyped = Object.entries(document.paths).flatMap(([path, item]) =>
      METHODS.flatMap((method) =>
        (item[method]?.parameters ?? []).flatMap((parameter) =>
          'in' in parameter &&
          parameter.in === 'path' &&
          parameter.name === 'organizationSlug' &&
          !(
            parameter.schema &&
            'type' in parameter.schema &&
            parameter.schema.type === 'string'
          )
            ? [`${method.toUpperCase()} ${path}`]
            : [],
        ),
      ),
    );
    expect(untyped).toEqual([]);
  });
});
