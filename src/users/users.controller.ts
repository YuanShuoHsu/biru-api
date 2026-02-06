import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { I18nLang } from 'nestjs-i18n';
import type { LangEnum } from 'src/db/schema/users';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '註冊使用者' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @I18nLang() lang: LangEnum,
    @Headers() headers: HeadersInit,
  ): Promise<UserResponseDto> {
    return this.usersService.createUserWithPassword(
      createUserDto,
      lang,
      headers,
    );
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
