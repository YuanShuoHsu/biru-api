import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { actor } from './attendance-actor';
import { AttendanceShiftsService } from './attendance-shifts.service';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import { AttendanceShiftPaginationQueryDto } from './dto/attendance-shift-pagination-query.dto';
import { AttendanceShiftRangeQueryDto } from './dto/attendance-shift-range-query.dto';
import {
  AttendanceCalendarDayKindsResponseDto,
  AttendancePunchResponseDto,
  AttendanceShiftRecordResponseDto,
  AttendanceShiftResponseDto,
  AttendanceShiftsResponseDto,
} from './dto/attendance-shift-response.dto';
import { CreateAttendancePunchDto } from './dto/create-attendance-punch.dto';
import {
  CreateAttendanceShiftsDto,
  UpdateAttendanceShiftDto,
} from './dto/create-attendance-shifts.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceShiftsController {
  constructor(
    private readonly attendanceShiftsService: AttendanceShiftsService,
  ) {}

  @Get('me/shifts')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的班表' })
  myShifts(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceShiftPaginationQueryDto,
  ): Promise<AttendanceShiftsResponseDto> {
    return this.attendanceShiftsService.shifts(
      actor(req, session),
      query,
      true,
    );
  }

  @Get('me/shifts/punchable')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我目前可打卡的班次' })
  myPunchableShifts(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
  ): Promise<AttendanceShiftResponseDto[]> {
    return this.attendanceShiftsService.punchableShifts(actor(req, session));
  }

  @Get('shifts')
  @Roles({ shift: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店班表' })
  shifts(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceShiftPaginationQueryDto,
  ): Promise<AttendanceShiftsResponseDto> {
    return this.attendanceShiftsService.shifts(
      actor(req, session),
      query,
      false,
    );
  }

  @Get('shifts/calendar')
  @Roles({ shift: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '指定期間的全店班表' })
  calendarShifts(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceShiftRangeQueryDto,
  ): Promise<AttendanceShiftResponseDto[]> {
    return this.attendanceShiftsService.calendarShifts(
      actor(req, session),
      query,
    );
  }

  @Get('day-kinds/calendar')
  @Roles({ shift: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '指定期間各員工的假日、例假與休息日' })
  calendarDayKinds(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceShiftRangeQueryDto,
  ): Promise<AttendanceCalendarDayKindsResponseDto> {
    return this.attendanceShiftsService.calendarDayKinds(
      actor(req, session),
      query,
    );
  }

  @Post('shifts')
  @Roles({ shift: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '批次建立班表' })
  createShifts(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceShiftsDto,
  ): Promise<AttendanceShiftRecordResponseDto[]> {
    return this.attendanceShiftsService.createShifts(
      actor(req, session),
      dto.shifts,
    );
  }

  @Patch('shifts/:id')
  @Roles({ shift: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '修改班別時段' })
  updateShift(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceShiftDto,
  ): Promise<AttendanceShiftRecordResponseDto> {
    return this.attendanceShiftsService.updateShift(
      actor(req, session),
      id,
      dto,
    );
  }

  @Patch('shifts/:id/cancel')
  @Roles({ shift: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '取消班別' })
  cancelShift(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceShiftsService.cancelShift(actor(req, session), id);
  }

  @Post('punch')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '打卡（上下班、休息起迄）' })
  punch(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendancePunchDto,
  ): Promise<AttendancePunchResponseDto> {
    return this.attendanceShiftsService.punch(
      actor(req, session),
      dto,
      req.ip ?? req.socket.remoteAddress ?? '',
    );
  }
}
