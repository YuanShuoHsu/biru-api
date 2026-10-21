import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

import type { Request } from 'express';

import { AuthBatchService } from '../auth/auth-batch.service.js';
import { isUserDeletable } from '../auth/deletion-guards.js';
import { Audit } from '../common/decorators/audit.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';
import { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import {
  UserDeletabilityDto,
  UserDeletabilityQueryDto,
} from './dto/user-deletability.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
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

  @Get()
  @ApiOperation({ summary: '查詢所有使用者' })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.users({});
  }

  @Get('list')
  @ApiOperation({ summary: '查詢所有使用者' })
  findList(
    @Query() query: ListUsersQueryDto,
  ): Promise<{ data: UserResponseDto[]; total: number }> {
    return this.usersService.listUsers(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '查詢使用者統計' })
  @ApiOkResponse({ type: UserStatsResponseDto })
  getStats(@Query() query: StatsBucketQueryDto): Promise<UserStatsResponseDto> {
    return this.usersService.getStats(query);
  }

  @Get('deletability')
  @ApiOperation({ summary: '查詢使用者是否可刪除' })
  @ApiOkResponse({ type: [UserDeletabilityDto] })
  async deletability(
    @Query() { ids }: UserDeletabilityQueryDto,
  ): Promise<UserDeletabilityDto[]> {
    return Promise.all(
      ids.map(async (id) => ({ id, deletable: await isUserDeletable(id) })),
    );
  }

  @Delete()
  @ApiOperation({ summary: '批次刪除使用者' })
  removeMany(
    @Req() { headers }: Request,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.removeUsers(headers, ids);
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

  @Get(':id')
  @ApiOperation({ summary: '查詢使用者' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.user({ id });
    if (!user) throw new NotFoundException();

    return user;
  }

  @Patch(':id')
  @Audit('user', { param: 'id' })
  @ApiOperation({ summary: '更新使用者' })
  update(
    @Body() updateUserDto: UpdateUserDto,
    @Param('id') id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser({
      where: { id },
      data: updateUserDto,
    });
  }

  @Delete(':id')
  @Audit('user', { param: 'id' })
  @ApiOperation({ summary: '刪除使用者' })
  remove(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deleteUser({ id });
  }
}
