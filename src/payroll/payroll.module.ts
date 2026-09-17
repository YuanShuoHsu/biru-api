import { Module } from '@nestjs/common';

import { AdminPayrollRulesController } from './admin-payroll-rules.controller';
import { PayrollRulesService } from './payroll-rules.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  controllers: [AdminPayrollRulesController, PayrollController],
  providers: [PayrollService, PayrollRulesService],
  exports: [PayrollRulesService],
})
export class PayrollModule {}
