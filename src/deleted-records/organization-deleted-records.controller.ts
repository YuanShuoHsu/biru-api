import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { OrganizationMember } from '../menus/decorators/roles.decorator.js';
import type { AuthRequest } from '../menus/guards/roles.guard.js';

import {
  canRestoreAnything,
  DeletedRecordsService,
} from './deleted-records.service.js';
import {
  DeletedRecordBatchResponseDto,
  DeletedRecordPaginationQueryDto,
  DeletedRecordPermissionDto,
  RestoreDeletedRecordsDto,
} from './dto/deleted-record-batch.dto.js';

@ApiTags('deleted-records')
@ApiParam({ name: 'organizationSlug' })
@Controller('organizations/:organizationSlug/deleted-records')
export class OrganizationDeletedRecordsController {
  constructor(private readonly deletedRecordsService: DeletedRecordsService) {}

  @Get()
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '查詢本店最近 30 天內刪除的資料' })
  async findAll(
    @Query() query: DeletedRecordPaginationQueryDto,
    @Req() req: AuthRequest,
  ): Promise<{ data: DeletedRecordBatchResponseDto[]; total: number }> {
    return this.deletedRecordsService.list(
      query,
      await this.deletedRecordsService.getScope(
        req.organizationId!,
        req.memberRole!,
      ),
    );
  }

  @Get('permission')
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '目前成員是否能還原本店的刪除資料' })
  @ApiOkResponse({ type: DeletedRecordPermissionDto })
  permission(@Req() req: AuthRequest): DeletedRecordPermissionDto {
    return { canRestore: canRestoreAnything(req.memberRole!) };
  }

  @Post('restore')
  @HttpCode(204)
  @OrganizationMember('organizationSlug')
  @ApiOperation({
    summary:
      '批次還原本店多次刪除的資料，須具備各資料的建立權限，全部成功或全部不還原',
  })
  async restore(
    @Body() { ids }: RestoreDeletedRecordsDto,
    @Req() req: AuthRequest,
    @Session() { user }: UserSession,
  ): Promise<void> {
    await this.deletedRecordsService.restore(
      ids,
      user,
      await this.deletedRecordsService.getScope(
        req.organizationId!,
        req.memberRole!,
      ),
    );
  }
}
