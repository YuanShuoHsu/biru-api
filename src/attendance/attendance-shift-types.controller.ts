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

import { Roles } from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { actor } from './attendance-actor';
import { AttendanceShiftTypesService } from './attendance-shift-types.service';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import {
  AttendanceShiftTypePaginationQueryDto,
  AttendanceShiftTypesResponseDto,
  SaveAttendanceShiftTypeDto,
} from './dto/attendance-shift-type.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance/shift-types')
export class AttendanceShiftTypesController {
  constructor(
    private readonly attendanceShiftTypesService: AttendanceShiftTypesService,
  ) {}

  @Get()
  @Roles({ shift: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '班別' })
  shiftTypes(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceShiftTypePaginationQueryDto,
  ): Promise<AttendanceShiftTypesResponseDto> {
    return this.attendanceShiftTypesService.shiftTypes(
      actor(req, session),
      query,
    );
  }

  @Post()
  @Roles({ shiftType: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增班別' })
  createShiftType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceShiftTypeDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceShiftTypesService.createShiftType(
      actor(req, session),
      dto,
    );
  }

  @Patch(':id')
  @Roles({ shiftType: ['update'] }, 'organizationSlug')
  @ApiOperation({
    summary: '修改班別',
    description: '已排定的班次存的是實際起訖時間，不會跟著變動。',
  })
  updateShiftType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: SaveAttendanceShiftTypeDto,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceShiftTypesService.updateShiftType(
      actor(req, session),
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles({ shiftType: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除班別' })
  deleteShiftType(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceShiftTypesService.deleteShiftType(
      actor(req, session),
      id,
    );
  }
}
