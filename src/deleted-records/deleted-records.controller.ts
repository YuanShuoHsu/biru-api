import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { DeletedRecordsService } from './deleted-records.service';
import {
  DeletedRecordBatchResponseDto,
  DeletedRecordPaginationQueryDto,
  RestoreDeletedRecordsDto,
} from './dto/deleted-record-batch.dto';

@ApiTags('deleted-records')
@ApiBearerAuth()
@ApiExtraModels(DeletedRecordBatchResponseDto)
@UseGuards(AdminGuard)
@Controller('deleted-records')
export class DeletedRecordsController {
  constructor(private readonly deletedRecordsService: DeletedRecordsService) {}

  @Get()
  @ApiOperation({ summary: '查詢最近 30 天內可還原的刪除' })
  findAll(
    @Query() query: DeletedRecordPaginationQueryDto,
  ): Promise<{ data: DeletedRecordBatchResponseDto[]; total: number }> {
    return this.deletedRecordsService.list(query);
  }

  @Post('restore')
  @HttpCode(204)
  @ApiOperation({ summary: '批次還原多次刪除，全部成功或全部不還原' })
  restore(
    @Body() { ids }: RestoreDeletedRecordsDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.deletedRecordsService.restore(ids, user);
  }
}
