import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import type { Response } from 'express';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RequestWithUser } from './types';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: '使用者登入' })
  async login(
    @Body() _dto: LoginDto,
    @Ip() ip: string,
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');

    return this.authService.login(req.user, { ip, userAgent }, res);
  }

  @ApiBearerAuth()
  @Get('profile')
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleLogin() {}

  // @Public()
  // @Get('google/callback')
  // @UseGuards(GoogleOAuthGuard)
  // googleLoginCallback(@Request() req: RequestWithUser) {
  //   return this.authService.login(req.user);
  // }

  // @Public()
  // @UseGuards(JwtRefreshAuthGuard)
  // @Post('refresh')
  // @ApiOperation({
  //   summary: '刷新 Token',
  // })
  // async refresh(@Body() dto: RefreshDto, @Request() req: RequestWithUser) {
  //   return this.authService.refresh(dto.refreshToken);
  // }

  // @ApiBearerAuth()
  // @Post('logout')
  // @ApiOperation({ summary: '登出' })
  // async logout(@Request() req: RequestWithUser) {
  //   // return this.authService.logout(req.user.id);
  // }

  // @Public()
  // @Post('refresh')
  // @ApiOperation({ summary: '使用 Refresh Token 換發 Access Token' })
  // @ApiBody({ type: RefreshDto })
  // async refresh(@Body() dto: RefreshDto) {
  //   return this.authService.refresh(dto.refreshToken);
  // }

  // @UseGuards(LocalAuthGuard)
  // @Post('logout')
  // async logout(@Request() req: RequestWithUser) {
  //   return this.authService.logout();
  // }
}
