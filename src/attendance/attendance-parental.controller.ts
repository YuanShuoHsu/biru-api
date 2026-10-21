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

import {
  OrganizationMember,
  Roles,
} from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import { actor } from './attendance-actor';
import { AttendanceParentalService } from './attendance-parental.service';
import { AssignAttendanceParentalChildDto } from './dto/assign-attendance-parental-child.dto';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import { AttendanceLeaveCaseRecordResponseDto } from './dto/attendance-leave-case-response.dto';
import { AttendanceParentalChildPaginationQueryDto } from './dto/attendance-parental-child-pagination-query.dto';
import {
  AttendanceParentalChildRecordResponseDto,
  AttendanceParentalChildrenResponseDto,
} from './dto/attendance-parental-child-response.dto';
import { AttendanceParentalReturnPaginationQueryDto } from './dto/attendance-parental-return-pagination-query.dto';
import {
  AttendanceParentalReturnRecordResponseDto,
  AttendanceParentalReturnsResponseDto,
} from './dto/attendance-parental-return-response.dto';
import { CreateAttendanceParentalChildDto } from './dto/create-attendance-parental-child.dto';
import { CreateAttendanceParentalReturnDto } from './dto/create-attendance-parental-return.dto';
import { ReviewAttendanceRequestDto } from './dto/review-attendance-request.dto';
import { UpdateAttendanceParentalChildDto } from './dto/update-attendance-parental-child.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceParentalController {
  constructor(
    private readonly attendanceParentalService: AttendanceParentalService,
  ) {}

  @Get('children')
  @Roles({ parentalChild: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店育嬰子女資料' })
  children(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceParentalChildPaginationQueryDto,
  ): Promise<AttendanceParentalChildrenResponseDto> {
    return this.attendanceParentalService.parentalChildren(
      actor(req, session),
      query,
      false,
    );
  }

  @Get('me/children')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的育嬰子女資料' })
  myChildren(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceParentalChildPaginationQueryDto,
  ): Promise<AttendanceParentalChildrenResponseDto> {
    return this.attendanceParentalService.parentalChildren(
      actor(req, session),
      query,
      true,
    );
  }

  @Post('children')
  @Roles({ parentalChild: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '核定育嬰子女資料' })
  createChild(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: CreateAttendanceParentalChildDto,
  ): Promise<AttendanceParentalChildRecordResponseDto> {
    return this.attendanceParentalService.createParentalChild(
      actor(req, session),
      dto,
    );
  }

  @Patch('children/:id')
  @Roles({ parentalChild: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '更正子女資料，已有育嬰案件時一併重驗期間' })
  updateChild(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceParentalChildDto,
  ): Promise<AttendanceParentalChildRecordResponseDto> {
    return this.attendanceParentalService.updateParentalChild(
      actor(req, session),
      id,
      dto,
    );
  }

  @Delete('children/:id')
  @Roles({ parentalChild: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除尚未被請假案件使用的子女資料' })
  deleteChild(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceParentalService.deleteParentalChild(
      actor(req, session),
      id,
    );
  }

  @Patch('leave-cases/:id/child')
  @Roles({ leaveCase: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '將既有育嬰案件歸入核定子女' })
  assignChild(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: AssignAttendanceParentalChildDto,
  ): Promise<AttendanceLeaveCaseRecordResponseDto> {
    return this.attendanceParentalService.assignParentalChild(
      actor(req, session),
      id,
      dto,
    );
  }

  @Get('return-requests')
  @Roles({ parentalReturn: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '全店提前復職申請' })
  returnRequests(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceParentalReturnPaginationQueryDto,
  ): Promise<AttendanceParentalReturnsResponseDto> {
    return this.attendanceParentalService.parentalReturns(
      actor(req, session),
      query,
      false,
    );
  }

  @Get('me/return-requests')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '我的提前復職申請' })
  myReturnRequests(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceParentalReturnPaginationQueryDto,
  ): Promise<AttendanceParentalReturnsResponseDto> {
    return this.attendanceParentalService.parentalReturns(
      actor(req, session),
      query,
      true,
    );
  }

  @Post('requests/:id/return')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '申請提前復職' })
  createReturn(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: CreateAttendanceParentalReturnDto,
  ): Promise<AttendanceParentalReturnRecordResponseDto> {
    return this.attendanceParentalService.createParentalReturn(
      actor(req, session),
      id,
      dto,
    );
  }

  @Patch('return-requests/:id/review')
  @Roles({ parentalReturn: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '核准或拒絕提前復職協議' })
  reviewReturn(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: ReviewAttendanceRequestDto,
  ): Promise<AttendanceParentalReturnRecordResponseDto> {
    return this.attendanceParentalService.reviewParentalReturn(
      actor(req, session),
      id,
      dto,
    );
  }

  @Patch('return-requests/:id/withdraw')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '撤回提前復職申請' })
  withdrawReturn(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceParentalReturnRecordResponseDto> {
    return this.attendanceParentalService.withdrawParentalReturn(
      actor(req, session),
      id,
    );
  }
}
