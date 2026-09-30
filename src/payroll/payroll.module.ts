import { Module } from '@nestjs/common';

import { AdminPayrollRulesController } from './admin-payroll-rules.controller';
import { PayrollEarningsController } from './payroll-earnings.controller';
import { PayrollEarningsService } from './payroll-earnings.service';
import { PayrollWithholdingController } from './payroll-withholding.controller';
import { PayrollWithholdingService } from './payroll-withholding.service';
import { PayrollRulesService } from './payroll-rules.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

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
  exports: [PayrollRulesService],
})
export class PayrollModule {}
