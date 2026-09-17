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
import { AttendanceTemplatesService } from './attendance-templates.service';
import { AttendanceIdResponseDto } from './dto/attendance-id-response.dto';
import { AttendanceShiftRecordResponseDto } from './dto/attendance-shift-response.dto';
import { AttendanceTemplatePaginationQueryDto } from './dto/attendance-template-pagination-query.dto';
import {
  AttendanceTemplateRecordResponseDto,
  AttendanceTemplatesResponseDto,
} from './dto/attendance-template-response.dto';
import { GenerateAttendanceTemplateDto } from './dto/generate-attendance-template.dto';
import { SaveAttendanceTemplateDto } from './dto/save-attendance-template.dto';

@ApiTags('attendance')
@Controller('organizations/:organizationSlug/attendance')
export class AttendanceTemplatesController {
  constructor(
    private readonly attendanceTemplatesService: AttendanceTemplatesService,
  ) {}

  @Get('templates')
  @Roles({ shiftTemplate: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '班表範本清單' })
  templates(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Query() query: AttendanceTemplatePaginationQueryDto,
  ): Promise<AttendanceTemplatesResponseDto> {
    return this.attendanceTemplatesService.templates(
      actor(req, session),
      query,
    );
  }

  @Post('templates')
  @Roles({ shiftTemplate: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '新增班表範本' })
  createTemplate(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Body() dto: SaveAttendanceTemplateDto,
  ): Promise<AttendanceTemplateRecordResponseDto> {
    return this.attendanceTemplatesService.saveTemplate(
      actor(req, session),
      dto,
    );
  }

  @Patch('templates/:id')
  @Roles({ shiftTemplate: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '更新班表範本' })
  updateTemplate(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: SaveAttendanceTemplateDto,
  ): Promise<AttendanceTemplateRecordResponseDto> {
    return this.attendanceTemplatesService.saveTemplate(
      actor(req, session),
      dto,
      id,
    );
  }

  @Delete('templates/:id')
  @Roles({ shiftTemplate: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除班表範本' })
  deleteTemplate(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<AttendanceIdResponseDto> {
    return this.attendanceTemplatesService.deleteTemplate(
      actor(req, session),
      id,
    );
  }

  @Post('templates/:id/generate')
  @Roles({ shift: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '依範本產生指定期間的班表' })
  generateTemplate(
    @Req() req: AuthRequest,
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: GenerateAttendanceTemplateDto,
  ): Promise<AttendanceShiftRecordResponseDto[]> {
    return this.attendanceTemplatesService.generateTemplate(
      actor(req, session),
      id,
      dto,
    );
  }
}
