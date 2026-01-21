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

import { Role } from 'prisma/generated/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';

import { CreateUserDto } from './dto/create-user.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('resend-verification')
  @ApiOperation({ summary: '重新寄送驗證信' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Headers('user-agent') userAgent: string,
  ): Promise<void> {
    return this.usersService.resendVerificationEmail(dto.email, userAgent);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: '註冊使用者' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @Headers('user-agent') userAgent: string,
  ): Promise<UserResponseDto> {
    return this.usersService.createUserWithPassword(createUserDto, userAgent);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
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
      data: updateUserDto,
      where: { id },
    });
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  @ApiOperation({ summary: '刪除使用者' })
  remove(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deleteUser({ id });
  }
}
