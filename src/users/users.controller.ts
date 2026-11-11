import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import type { Request, Response } from 'express';

import { AuthBatchService } from '../auth/auth-batch.service.js';
import { IdsDto } from '../common/dto/ids.dto.js';
import { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UserImageParamsDto } from './dto/user-image-params.dto.js';
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

  // https://docs.nestjs.com/techniques/streaming-files
  @Get(':id/image/:version.:extension')
  @SkipThrottle()
  @ApiOperation({ summary: '取得使用者的頭像' })
  @ApiProduces('image/*')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async findImage(
    @Param() params: UserImageParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { current, mimeType, data } =
      await this.usersService.findImage(params);

    // 錯誤回應不能帶永久快取，所以不用 @Header()
    // https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.7
    res.set({
      'Cache-Control': current
        ? 'private, max-age=31536000, immutable'
        : 'private, no-cache',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'none'; sandbox;",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    return new StreamableFile(data, { type: mimeType });
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
