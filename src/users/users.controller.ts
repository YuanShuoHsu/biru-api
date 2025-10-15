import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';

import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user.response';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: '註冊使用者' })
  async signup(@Body() userData: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.createUser(userData);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  // @Get()
  // @ApiOperation({ summary: '查詢所有使用者' })
  // findAll(): Promise<User[]> {
  //   return this.userService.users({});
  // }

  // @Get(':id')
  // @ApiOperation({ summary: '查詢使用者' })
  // findOne(@Param('id') id: string): Promise<User | null> {
  //   return this.userService.user({ id: Number(id) });
  // }

  // @Patch(':id')
  // @ApiOperation({ summary: '更新使用者' })
  // update(
  //   @Param('id') id: string,
  //   @Body() data: { name?: string; email?: string },
  // ): Promise<User> {
  //   return this.userService.updateUser({
  //     where: { id: Number(id) },
  //     data,
  //   });
  // }

  // @Delete(':id')
  // @ApiOperation({ summary: '刪除使用者' })
  // remove(@Param('id') id: string): Promise<User> {
  //   return this.userService.deleteUser({ id: Number(id) });
  // }
}
