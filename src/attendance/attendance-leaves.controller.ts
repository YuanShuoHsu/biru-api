import {
  Body,
  Controller,
  Delete,
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

import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { actor } from './attendance-actor';
import { AttendanceLeavesService } from './attendance-leaves.service';
import { AttendanceLeaveBalancePaginationQueryDto } from './dto/attendance-leave-balance-pagination-query.dto';
import {
  AttendanceLeaveBalanceRecordResponseDto,
  AttendanceLeaveBalancesResponseDto,
} from './dto/attendance-leave-balance-response.dto';
import { AttendanceLeaveCasePaginationQueryDto } from './dto/attendance-leave-case-pagination-query.dto';
import {
  AttendanceLeaveCaseRecordResponseDto,
  AttendanceLeaveCasesResponseDto,
} from './dto/attendance-leave-case-response.dto';
import { AttendanceLeaveTypePaginationQueryDto } from './dto/attendance-leave-type-pagination-query.dto';
import {
  AttendanceLeaveTypeResponseDto,
  AttendanceLeaveTypesResponseDto,
} from './dto/attendance-leave-type-response.dto';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import {
  AttendanceHolidaySubstitutePaginationQueryDto,
  AttendanceHolidaySubstitutesResponseDto,
  CreateAttendanceHolidaySubstituteDto,
} from './dto/attendance-holiday-substitute.dto';
import { CreateAttendanceAnnualLeaveDeferralDto } from './dto/create-attendance-annual-leave-deferral.dto';
import { CreateAttendanceLeaveCaseDto } from './dto/create-attendance-leave-case.dto';
import { SaveAttendanceLeaveBalanceDto } from './dto/save-attendance-leave-balance.dto';
import { SaveAttendanceLeaveTypeDto } from './dto/save-attendance-leave-type.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceLeavesController {
  constructor(
    private readonly attendanceLeavesService: AttendanceLeavesService,
  ) {}

  @Get('leave-cases')
  @Roles({ leaveCase: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店請假案件' })
  leaveCases(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceLeaveCasePaginationQueryDto,
  ): Promise<AttendanceLeaveCasesResponseDto> {
    return this.attendanceLeavesService.leaveCases(
      actor(req, session),
      query,
      false,
    );
  }

  @Get('me/leave-cases')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的請假案件' })
  myLeaveCases(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceLeaveCasePaginationQueryDto,
  ): Promise<AttendanceLeaveCasesResponseDto> {
    return this.attendanceLeavesService.leaveCases(
      actor(req, session),
      query,
      true,
    );
  }

  @Post('leave-cases')
  @Roles({ leaveCase: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '建立請假案件' })
  createLeaveCase(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceLeaveCaseDto,
  ): Promise<AttendanceLeaveCaseRecordResponseDto> {
    return this.attendanceLeavesService.createLeaveCase(
      actor(req, session),
      dto,
    );
  }

  @Patch('leave-cases/:id')
  @Roles({ leaveCase: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '修改請假案件' })
  updateLeaveCase(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: CreateAttendanceLeaveCaseDto,
  ): Promise<AttendanceLeaveCaseRecordResponseDto> {
    return this.attendanceLeavesService.updateLeaveCase(
      actor(req, session),
      id,
      dto,
    );
  }

  @Delete('leave-cases/:id')
  @Roles({ leaveCase: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除尚未被使用的請假案件' })
  deleteLeaveCase(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.deleteLeaveCase(
      actor(req, session),
      id,
    );
  }

  @Get('leave-types')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '假別清單' })
  leaveTypes(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceLeaveTypePaginationQueryDto,
  ): Promise<AttendanceLeaveTypesResponseDto> {
    return this.attendanceLeavesService.leaveTypes(actor(req, session), query);
  }

  @Post('leave-types')
  @Roles({ leaveType: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增假別' })
  createLeaveType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceLeaveTypeDto,
  ): Promise<AttendanceLeaveTypeResponseDto> {
    return this.attendanceLeavesService.saveLeaveType(actor(req, session), dto);
  }

  @Patch('leave-types/:id')
  @Roles({ leaveType: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '更新假別' })
  updateLeaveType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: SaveAttendanceLeaveTypeDto,
  ): Promise<AttendanceLeaveTypeResponseDto> {
    return this.attendanceLeavesService.saveLeaveType(
      actor(req, session),
      dto,
      id,
    );
  }

  @Delete('leave-types/:id')
  @Roles({ leaveType: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除尚未被使用的自訂假別' })
  deleteLeaveType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.deleteLeaveType(
      actor(req, session),
      id,
    );
  }

  @Get('me/leave-balances')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的假別餘額' })
  myLeaveBalances(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceLeaveBalancePaginationQueryDto,
  ): Promise<AttendanceLeaveBalancesResponseDto> {
    return this.attendanceLeavesService.leaveBalances(
      actor(req, session),
      query,
      true,
    );
  }

  @Get('leave-balances')
  @Roles({ leaveBalance: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店假別餘額' })
  leaveBalances(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceLeaveBalancePaginationQueryDto,
  ): Promise<AttendanceLeaveBalancesResponseDto> {
    return this.attendanceLeavesService.leaveBalances(
      actor(req, session),
      query,
      false,
    );
  }

  @Put('leave-balances')
  @Roles({ leaveBalance: ['create', 'update'] }, 'organizationSlug')
  @ApiOperation({ summary: '設定假別給假時數' })
  saveLeaveBalance(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceLeaveBalanceDto,
  ): Promise<AttendanceLeaveBalanceRecordResponseDto> {
    return this.attendanceLeavesService.saveLeaveBalance(
      actor(req, session),
      dto,
    );
  }

  @Post('annual-leave-deferrals')
  @Roles({ leaveBalance: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '記錄特休遞延協議' })
  createAnnualLeaveDeferral(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceAnnualLeaveDeferralDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.createAnnualLeaveDeferral(
      actor(req, session),
      dto,
    );
  }

  @Delete('annual-leave-deferrals/:id')
  @Roles({ leaveBalance: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '撤銷特休遞延協議' })
  deleteAnnualLeaveDeferral(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.deleteAnnualLeaveDeferral(
      actor(req, session),
      id,
    );
  }

  @Get('holiday-substitutes')
  @Roles({ shift: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '國定假日遇例休應補假' })
  holidaySubstitutes(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceHolidaySubstitutePaginationQueryDto,
  ): Promise<AttendanceHolidaySubstitutesResponseDto> {
    return this.attendanceLeavesService.holidaySubstitutes(
      actor(req, session),
      query,
    );
  }

  @Post('holiday-substitutes')
  @Roles({ shift: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '指定補假日' })
  createHolidaySubstitute(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceHolidaySubstituteDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.createHolidaySubstitute(
      actor(req, session),
      dto,
    );
  }

  @Delete('holiday-substitutes/:id')
  @Roles({ shift: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '撤銷補假日' })
  deleteHolidaySubstitute(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceLeavesService.deleteHolidaySubstitute(
      actor(req, session),
      id,
    );
  }
}
