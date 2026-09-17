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
import { AttendanceRequestsService } from './attendance-requests.service';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import { AttendanceRequestPaginationQueryDto } from './dto/attendance-request-pagination-query.dto';
import {
  AttendanceRequestRecordResponseDto,
  AttendanceRequestsResponseDto,
} from './dto/attendance-request-response.dto';
import { CreateAttendanceRequestDto } from './dto/create-attendance-request.dto';
import { ReviewAttendanceRequestDto } from './dto/review-attendance-request.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceRequestsController {
  constructor(
    private readonly attendanceRequestsService: AttendanceRequestsService,
  ) {}

  @Get('me/requests')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的申請單' })
  myRequests(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceRequestPaginationQueryDto,
  ): Promise<AttendanceRequestsResponseDto> {
    return this.attendanceRequestsService.requests(
      actor(req, session),
      query,
      true,
    );
  }

  @Get('requests')
  @Roles({ attendanceRequest: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店申請單' })
  requests(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceRequestPaginationQueryDto,
  ): Promise<AttendanceRequestsResponseDto> {
    return this.attendanceRequestsService.requests(
      actor(req, session),
      query,
      false,
    );
  }

  @Post('requests')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '送出補打卡、請假或加班申請' })
  createRequest(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceRequestDto,
  ): Promise<AttendanceRequestRecordResponseDto> {
    return this.attendanceRequestsService.createRequest(
      actor(req, session),
      dto,
    );
  }

  @Patch('requests/:id/review')
  @Roles({ attendanceRequest: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '審核申請單' })
  review(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: ReviewAttendanceRequestDto,
  ): Promise<AttendanceRequestRecordResponseDto> {
    return this.attendanceRequestsService.review(actor(req, session), id, dto);
  }

  @Patch('requests/:id/withdraw')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '撤回申請單' })
  withdraw(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceRequestsService.withdraw(actor(req, session), id);
  }
}
