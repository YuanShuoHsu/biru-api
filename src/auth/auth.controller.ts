import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Query,
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
import { LogoutResponseDto } from './dto/logout-response.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type {
  RequestWithCookies,
  RequestWithGoogleUser,
  RequestWithUser,
} from './types';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: '使用者登入' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rememberMe = dto.rememberMe;
    const userAgent = req.get('user-agent');

    return this.authService.login(req.user, { ip, rememberMe, userAgent }, res);
  }

  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: '查詢登入使用者資料' })
  getProfile(@Request() req: RequestWithUser): ProfileResponseDto {
    return req.user;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: '前往 Google 登入' })
  async googleLogin() {}

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: '完成 Google 登入' })
  googleLoginCallback(
    @Ip() ip: string,
    @Query('state') state: string,
    @Request() req: RequestWithGoogleUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rememberMe = state === 'true';
    const userAgent = req.get('user-agent');

    return this.authService.loginWithGoogle(
      req.user,
      { ip, rememberMe, userAgent },
      res,
    );
    // // 記得後端 redirect
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '使用者憑證續期' })
  async refresh(
    @Ip() ip: string,
    @Request() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    const refreshToken = req.cookies.refresh_token;

    return this.authService.refresh(refreshToken, { ip, userAgent }, res);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: '使用者登出' })
  async logout(
    @Request() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const refreshToken = req.cookies.refresh_token;

    return this.authService.logout(refreshToken, res);
  }
}
