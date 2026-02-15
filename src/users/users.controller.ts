import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
