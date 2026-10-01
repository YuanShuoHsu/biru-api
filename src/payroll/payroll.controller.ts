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

import {
  EmployerHealthSupplementQueryDto,
  EmployerHealthSupplementResponseDto,
} from './dto/employer-health-supplement.dto';
import { AttendanceBatchResponseDto } from 'src/attendance/dto/review-attendance-request.dto';

import { PayrollBatchDraftDto, PayrollDraftDto } from './dto/payroll-draft.dto';
import {
  PayrollBatchReviewDto,
  PayrollReviewDto,
} from './dto/payroll-review.dto';
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

  @Get('employer-health-supplement')
  @Roles({ payslip: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '投保單位當月補充保費' })
  employerHealthSupplement(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: EmployerHealthSupplementQueryDto,
  ): Promise<EmployerHealthSupplementResponseDto> {
    return this.payrollService.employerHealthSupplement(
      actor(req, session),
      query.month,
    );
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

  @Post('statements/batch')
  @Roles({ payslip: ['create'] }, 'organizationSlug')
  @ApiOperation({
    summary: '試算當月所有員工的薪資單草稿',
    description:
      '對象為當月在職且薪資單尚未覆核或發布的員工，既有草稿會重新試算；無法試算者跳過並附上原因。回傳的 id 為員工 id。',
  })
  draftBatch(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollBatchDraftDto,
  ): Promise<AttendanceBatchResponseDto> {
    return this.payrollService.draftBatch(actor(req, session), dto);
  }

  @Patch('statements/review')
  @Roles({ payslip: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '批次覆核薪資單' })
  reviewBatch(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollBatchReviewDto,
  ): Promise<AttendanceBatchResponseDto> {
    return this.payrollService.transitionBatch(
      actor(req, session),
      'reviewed',
      dto,
    );
  }

  @Patch('statements/publish')
  @Roles({ payslip: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '批次發布薪資單' })
  publishBatch(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: PayrollBatchReviewDto,
  ): Promise<AttendanceBatchResponseDto> {
    return this.payrollService.transitionBatch(
      actor(req, session),
      'published',
      dto,
    );
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
