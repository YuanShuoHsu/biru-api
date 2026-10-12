import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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

import { OrganizationMember } from 'src/menus/decorators/roles.decorator';
import type { AuthRequest } from 'src/menus/guards/roles.guard';

import {
  canRestoreAnything,
  DeletedRecordsService,
} from './deleted-records.service';
import {
  DeletedRecordBatchResponseDto,
  DeletedRecordPaginationQueryDto,
  DeletedRecordPermissionDto,
} from './dto/deleted-record-batch.dto';

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

  @Post(':batchId/restore')
  @HttpCode(204)
  @OrganizationMember('organizationSlug')
  @ApiOperation({ summary: '還原本店同一次刪除的資料，須具備各資料的建立權限' })
  async restore(
    @Param('batchId', ParseIntPipe) batchId: number,
    @Req() req: AuthRequest,
    @Session() { user }: UserSession,
  ): Promise<void> {
    await this.deletedRecordsService.restore(
      batchId,
      user,
      await this.deletedRecordsService.getScope(
        req.organizationId!,
        req.memberRole!,
      ),
    );
  }
}
