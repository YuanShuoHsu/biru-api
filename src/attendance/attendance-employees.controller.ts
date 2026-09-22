import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { actor } from './attendance-actor';
import { AttendanceEmployeesService } from './attendance-employees.service';
import { AttendanceEmployeePaginationQueryDto } from './dto/attendance-employee-pagination-query.dto';
import {
  AttendanceContextResponseDto,
  AttendanceEmployeeResponseDto,
  AttendanceEmployeesResponseDto,
  AttendanceMembersResponseDto,
} from './dto/attendance-employee-response.dto';
import { AttendanceErrorResponseDto } from './dto/attendance-error-response.dto';
import { AttendanceSettingsResponseDto } from './dto/attendance-settings-response.dto';
import { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto';
import { SaveAttendanceSettingsDto } from './dto/save-attendance-settings.dto';

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
