import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { IdsDto } from '../common/dto/ids.dto.js';
import {
  OrganizationMember,
  Roles,
} from '../menus/decorators/roles.decorator.js';
import type { AuthRequest } from '../menus/guards/roles.guard.js';
import { OccupationalIndustryRateResponseDto } from '../payroll/dto/payroll-rule-set-response.dto.js';

import { actor } from './attendance-actor.js';
import { AttendanceEmployeesService } from './attendance-employees.service.js';
import { AttendanceEmployeePaginationQueryDto } from './dto/attendance-employee-pagination-query.dto.js';
import {
  AttendanceContextResponseDto,
  AttendanceEmployeeResponseDto,
  AttendanceEmployeesResponseDto,
  AttendanceLegalStatusObligationResponseDto,
  AttendanceMembersResponseDto,
} from './dto/attendance-employee-response.dto.js';
import { AttendanceErrorResponseDto } from './dto/attendance-error-response.dto.js';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto.js';
import { AttendanceSettingsResponseDto } from './dto/attendance-settings-response.dto.js';
import { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto.js';
import { SaveAttendanceSettingsDto } from './dto/save-attendance-settings.dto.js';

@ApiTags('attendance')
@ApiExtraModels(AttendanceErrorResponseDto)
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceEmployeesController {
  constructor(
    private readonly attendanceEmployeesService: AttendanceEmployeesService,
  ) {}

  @Get('context')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '打卡首頁狀態（員工資料與可用權限）' })
  context(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
  ): Promise<AttendanceContextResponseDto> {
    return this.attendanceEmployeesService.context(actor(req, session));
  }

  @Get('members')
  @Roles({ employee: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '組織成員與其出勤設定清單' })
  members(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceEmployeePaginationQueryDto,
  ): Promise<AttendanceMembersResponseDto> {
    return this.attendanceEmployeesService.members(actor(req, session), query);
  }

  @Get('legal-status-obligations')
  @Roles({ employee: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '各法定身分的就保、勞退與工作許可義務' })
  legalStatusObligations(): AttendanceLegalStatusObligationResponseDto[] {
    return this.attendanceEmployeesService.legalStatusObligations();
  }

  @Get('occupational-industries')
  @Roles({ attendanceSetting: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '現行職災保險適用行業別及費率' })
  occupationalIndustries(): Promise<OccupationalIndustryRateResponseDto[]> {
    return this.attendanceEmployeesService.occupationalIndustries();
  }

  @Get('employees')
  @Roles({ employee: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '員工清單' })
  employees(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceEmployeePaginationQueryDto,
  ): Promise<AttendanceEmployeesResponseDto> {
    return this.attendanceEmployeesService.employees(
      actor(req, session),
      query,
    );
  }

  @Get('employees/:id')
  @Roles({ employee: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '取得單一員工設定' })
  employee(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceEmployeeResponseDto> {
    return this.attendanceEmployeesService.employee(actor(req, session), id);
  }

  @Put('employees')
  @Roles({ employee: ['create', 'update'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增或更新員工' })
  saveEmployee(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceEmployeeDto,
  ): Promise<AttendanceEmployeeResponseDto> {
    return this.attendanceEmployeesService.saveEmployee(
      actor(req, session),
      dto,
    );
  }

  @Delete('employees')
  @Roles({ employee: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '批次刪除沒有任何出勤或薪資紀錄的員工設定' })
  deleteEmployees(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.attendanceEmployeesService.deleteEmployees(
      actor(req, session),
      ids,
    );
  }

  @Delete('employees/:id')
  @Roles({ employee: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除沒有任何出勤或薪資紀錄的員工設定' })
  deleteEmployee(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceEmployeesService.deleteEmployee(
      actor(req, session),
      id,
    );
  }

  @Get('settings')
  @Roles({ attendanceSetting: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '取得打卡設定' })
  settings(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
  ): Promise<AttendanceSettingsResponseDto> {
    return this.attendanceEmployeesService.settings(actor(req, session));
  }

  @Put('settings')
  @Roles({ attendanceSetting: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '儲存打卡設定' })
  saveSettings(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceSettingsDto,
  ): Promise<AttendanceSettingsResponseDto> {
    return this.attendanceEmployeesService.saveSettings(
      actor(req, session),
      dto,
    );
  }
}
