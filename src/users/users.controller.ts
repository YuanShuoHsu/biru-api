import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

import type { Request } from 'express';

import { AuthBatchService } from '../auth/auth-batch.service.js';
import { IdsDto } from '../common/dto/ids.dto.js';
import { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UserListResponseDto } from './dto/user-response.dto.js';
import { UserSessionPaginationQueryDto } from './dto/user-session-pagination-query.dto.js';
import { UserSessionListResponseDto } from './dto/user-session-response.dto.js';
import { UserStatsResponseDto } from './dto/user-stats.dto.js';
import { UsersService } from './users.service.js';

@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authBatchService: AuthBatchService,
  ) {}

  @Get('list')
  @ApiOperation({ summary: '查詢所有使用者' })
  @ApiOkResponse({ type: UserListResponseDto })
  findList(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.usersService.listUsers(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '查詢使用者統計' })
  @ApiOkResponse({ type: UserStatsResponseDto })
  getStats(@Query() query: StatsBucketQueryDto): Promise<UserStatsResponseDto> {
    return this.usersService.getStats(query);
  }

  @Delete()
  @ApiOperation({ summary: '批次刪除使用者' })
  removeMany(
    @Req() { headers }: Request,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.removeUsers(headers, ids);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: '查詢使用者的登入裝置' })
  @ApiOkResponse({ type: UserSessionListResponseDto })
  findSessions(
    @Param('id') id: string,
    @Query() query: UserSessionPaginationQueryDto,
  ): Promise<UserSessionListResponseDto> {
    return this.usersService.listUserSessions(id, query);
  }

  @Delete(':id/sessions')
  @ApiOperation({ summary: '批次撤銷使用者的登入裝置' })
  revokeSessions(
    @Req() { headers }: Request,
    @Param('id') id: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.revokeUserSessions(headers, id, ids);
  }
}
