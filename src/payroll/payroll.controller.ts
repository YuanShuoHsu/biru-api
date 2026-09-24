import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { actor } from 'src/attendance/attendance-actor';
import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { PayrollDraftDto } from './dto/payroll-draft.dto';
import { PayrollInsuranceGradesResponseDto } from './dto/payroll-insurance-grades-response.dto';
import { PayrollMonthQueryDto } from './dto/payroll-month-query.dto';
import { PayrollReviewDto } from './dto/payroll-review.dto';
import { PayrollStatementPaginationQueryDto } from './dto/payroll-statement-pagination-query.dto';
import {
  PayrollStatementResponseDto,
  PayrollStatementsResponseDto,
  toPayrollStatementResponse,
} from './dto/payroll-statement-response.dto';
import { PayrollTermsResponseDto } from './dto/payroll-terms-response.dto';
import { PayrollTermsDto } from './dto/payroll-terms.dto';
import { PayrollService } from './payroll.service';

@ApiTags('payroll')
@Controller('organizations/:organizationSlug/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('terms')
  @Roles({ payrollTerm: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '薪資條件清單' })
  terms(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
  ): Promise<PayrollTermsResponseDto[]> {
    return this.payrollService.terms(actor(req, session));
  }

  @Get('insurance-grades')
  @Roles({ payrollTerm: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '指定月份適用的勞健保投保級距' })
  insuranceGrades(
    @Query() { month }: PayrollMonthQueryDto,
  ): Promise<PayrollInsuranceGradesResponseDto> {
    return this.payrollService.insuranceGrades(month);
  }

  @Put('terms')
  @Roles({ payrollTerm: ['create', 'update'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增或更新薪資條件' })
  saveTerms(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollTermsDto,
  ): Promise<PayrollTermsResponseDto> {
    return this.payrollService.saveTerms(actor(req, session), dto);
  }

  @Get('statements')
  @Roles({ payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店薪資單' })
  statements(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollStatementPaginationQueryDto,
  ): Promise<PayrollStatementsResponseDto> {
    return this.payrollService
      .list(actor(req, session), false, query)
      .then(({ data, total }) => ({
        data: data.map(toPayrollStatementResponse),
        total,
      }));
  }

  @Get('me/statements')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的薪資單' })
  myStatements(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollStatementPaginationQueryDto,
  ): Promise<PayrollStatementsResponseDto> {
    return this.payrollService
      .list(actor(req, session), true, query)
      .then(({ data, total }) => ({
        data: data.map(toPayrollStatementResponse),
        total,
      }));
  }

  @Post('statements')
  @Roles({ payslip: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '試算薪資單草稿' })
  draft(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollDraftDto,
  ): Promise<PayrollStatementResponseDto> {
    return this.payrollService
      .draft(actor(req, session), dto)
      .then(toPayrollStatementResponse);
  }

  @Patch('statements/:id/review')
  @Roles({ payslip: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '覆核薪資單' })
  review(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: PayrollReviewDto,
  ): Promise<PayrollStatementResponseDto> {
    return this.payrollService
      .transition(actor(req, session), id, 'reviewed', dto.reason)
      .then(toPayrollStatementResponse);
  }

  @Patch('statements/:id/publish')
  @Roles({ payslip: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '發布薪資單' })
  publish(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: PayrollReviewDto,
  ): Promise<PayrollStatementResponseDto> {
    return this.payrollService
      .transition(actor(req, session), id, 'published', dto.reason)
      .then(toPayrollStatementResponse);
  }
}
