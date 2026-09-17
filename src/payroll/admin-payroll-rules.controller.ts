import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { ConfirmRuleSetDto } from './dto/confirm-rule-set.dto';
import {
  PayrollRuleIngestResponseDto,
  PayrollRuleSetResponseDto,
} from './dto/payroll-rule-set-response.dto';
import { RuleSetPeriodParamDto } from './dto/rule-set-period-param.dto';
import { PayrollRulesService } from './payroll-rules.service';

@ApiTags('payroll')
@UseGuards(AdminGuard)
@Controller('payroll/rule-sets')
export class AdminPayrollRulesController {
  constructor(private readonly payrollRulesService: PayrollRulesService) {}

  @Get()
  @ApiOperation({ summary: '投保級距與費率版本清單' })
  list(): Promise<PayrollRuleSetResponseDto[]> {
    return this.payrollRulesService.list();
  }

  @Post('ingest')
  @ApiOperation({ summary: '從政府開放資料更新投保級距' })
  ingest(): Promise<PayrollRuleIngestResponseDto> {
    return this.payrollRulesService.ingest();
  }

  @Patch(':effectiveFrom')
  @ApiOperation({ summary: '依官方公告確認每小時最低工資' })
  confirm(
    @Param() { effectiveFrom }: RuleSetPeriodParamDto,
    @Body() dto: ConfirmRuleSetDto,
  ): Promise<PayrollRuleSetResponseDto> {
    return this.payrollRulesService.confirm(effectiveFrom, dto);
  }
}
