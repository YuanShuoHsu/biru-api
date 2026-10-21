import { Module } from '@nestjs/common';

import { AdminPayrollRulesController } from './admin-payroll-rules.controller.js';
import { PayrollEarningsController } from './payroll-earnings.controller.js';
import { PayrollEarningsService } from './payroll-earnings.service.js';
import { PayrollWithholdingController } from './payroll-withholding.controller.js';
import { PayrollWithholdingService } from './payroll-withholding.service.js';
import { PayrollRulesService } from './payroll-rules.service.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';

@Module({
  controllers: [
    AdminPayrollRulesController,
    PayrollController,
    PayrollEarningsController,
    PayrollWithholdingController,
  ],
  providers: [
    PayrollService,
    PayrollRulesService,
    PayrollEarningsService,
    PayrollWithholdingService,
  ],
  exports: [PayrollEarningsService, PayrollRulesService],
})
export class PayrollModule {}
