import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { fromNodeHeaders } from 'better-auth/node';
import type { Request as ExpressRequest } from 'express';
import { I18nLang } from 'nestjs-i18n';
import type { LangEnum } from 'src/db/schema/users';
import { VerifyEmailDto } from 'src/users/dto/verify-email.dto';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: '註冊使用者' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @I18nLang() lang: LangEnum,
    @Request() req: ExpressRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.createUserWithPassword(
      createUserDto,
      lang,
      fromNodeHeaders(req.headers),
    );
  }

  @AllowAnonymous()
  @Post('verify-email')
  @ApiOperation({ summary: '驗證使用者 Email' })
  async verify(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.usersService.verifyEmail(verifyEmailDto);
  }

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: '查詢所有使用者' })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.users({});
  }

  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: '查詢使用者' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.user({ id });
    if (!user) throw new NotFoundException();

    return user;
  }

  @ApiBearerAuth()
  @Patch(':id')
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

  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: '刪除使用者' })
  remove(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deleteUser({ id });
  }
}
