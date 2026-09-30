import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { actor } from 'src/attendance/attendance-actor';
import { AttendanceIdResponseDto } from 'src/attendance/dto/attendance-id-response.dto';
import { Roles } from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import {
  CreatePayrollEarningTypeDto,
  PayrollEarningInputDto,
  PayrollEarningQueryDto,
  PayrollEarningTypePaginationQueryDto,
  PayrollEarningTypesResponseDto,
  RenamePayrollEarningTypeDto,
} from './dto/payroll-earning.dto';
import { PayrollEarningsService } from './payroll-earnings.service';

@ApiTags('payroll')
@Controller('organizations/:organizationSlug/payroll')
export class PayrollEarningsController {
  constructor(
    private readonly payrollEarningsService: PayrollEarningsService,
  ) {}

  @Get('earning-types')
  @Roles({ payrollTerm: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '薪資加項名目' })
  earningTypes(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollEarningTypePaginationQueryDto,
  ): Promise<PayrollEarningTypesResponseDto> {
    return this.payrollEarningsService.earningTypes(actor(req, session), query);
  }

  @Post('earning-types')
  @Roles({ payrollTerm: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增薪資加項名目' })
  createEarningType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreatePayrollEarningTypeDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.payrollEarningsService.createEarningType(
      actor(req, session),
      dto,
    );
  }

  @Patch('earning-types/:id')
  @Roles({ payrollTerm: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '重新命名薪資加項名目' })
  renameEarningType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: RenamePayrollEarningTypeDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.payrollEarningsService.renameEarningType(
      actor(req, session),
      id,
      dto,
    );
  }

  @Delete('earning-types/:id')
  @Roles({ payrollTerm: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除尚未使用的薪資加項名目' })
  deleteEarningType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.payrollEarningsService.deleteEarningType(
      actor(req, session),
      id,
    );
  }

  @Get('earnings')
  @Roles({ payslip: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '員工當月已登錄的薪資加項' })
  earnings(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: PayrollEarningQueryDto,
  ): Promise<PayrollEarningInputDto[]> {
    return this.payrollEarningsService.earnings(
      actor(req, session),
      query.employeeId,
      query.month,
    );
  }
}
