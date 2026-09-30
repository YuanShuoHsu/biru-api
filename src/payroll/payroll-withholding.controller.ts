import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { actor } from 'src/attendance/attendance-actor';
import { AttendanceIdResponseDto } from 'src/attendance/dto/attendance-id-response.dto';
import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import {
  MyWithholdingCertificateResponseDto,
  PayrollNonResidentFileQueryDto,
  PayrollTaxIdentityDto,
  PayrollWithholdingFileResponseDto,
  PayrollWithholdingSummaryResponseDto,
  PayrollWithholdingUnitDto,
  PayrollWithholdingUnitResponseDto,
  PayrollWithholdingYearQueryDto,
} from './dto/payroll-withholding.dto';
import { PayrollWithholdingService } from './payroll-withholding.service';

@ApiTags('payroll')
@Controller('organizations/:organizationSlug/payroll')
export class PayrollWithholdingController {
  constructor(
    private readonly payrollWithholdingService: PayrollWithholdingService,
  ) {}

  @Get('withholding-certificates')
  @Roles({ payrollTerm: ['read'], payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '年度扣繳憑單彙總與申報單位資料' })
  summary(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollWithholdingYearQueryDto,
  ): Promise<PayrollWithholdingSummaryResponseDto> {
    return this.payrollWithholdingService.summary(
      actor(req, session),
      query.year,
    );
  }

  @Get('withholding-file')
  @Roles({ payrollTerm: ['read'], payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({
    summary: '產生各類所得扣繳憑單電子申報檔（UTF-8 分隔符號格式）',
  })
  file(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollWithholdingYearQueryDto,
  ): Promise<PayrollWithholdingFileResponseDto> {
    return this.payrollWithholdingService.file(actor(req, session), query.year);
  }

  @Get('withholding-file/non-resident')
  @Roles({ payrollTerm: ['read'], payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({
    summary: '產生非居住者給付日的扣繳憑單申報檔（給付後 10 日內申報）',
  })
  nonResidentFile(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollNonResidentFileQueryDto,
  ): Promise<PayrollWithholdingFileResponseDto> {
    return this.payrollWithholdingService.nonResidentFile(
      actor(req, session),
      query.paymentDate,
    );
  }

  @Put('withholding-unit')
  @Roles({ payrollTerm: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '儲存扣繳單位申報資料' })
  saveUnit(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollWithholdingUnitDto,
  ): Promise<PayrollWithholdingUnitResponseDto> {
    return this.payrollWithholdingService.saveUnit(actor(req, session), dto);
  }

  @Put('tax-identities/:employeeId')
  @Roles({ payrollTerm: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '儲存員工身分證統一編號與戶籍地址（加密）' })
  saveTaxIdentity(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('employeeId') employeeId: string,
    @Body() dto: PayrollTaxIdentityDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.payrollWithholdingService.saveTaxIdentity(
      actor(req, session),
      employeeId,
      dto,
    );
  }

  @Get('me/withholding-certificates')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的扣繳憑單（已結束的年度）' })
  mine(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
  ): Promise<MyWithholdingCertificateResponseDto[]> {
    return this.payrollWithholdingService.mine(actor(req, session));
  }

  @Post('me/withholding-certificates/:year/request')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '申請填發扣繳憑單（免填發年度改為填發）' })
  requestCertificate(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('year', ParseIntPipe) year: number,
  ): Promise<AttendanceIdResponseDto> {
    return this.payrollWithholdingService.requestCertificate(
      actor(req, session),
      year,
    );
  }
}
