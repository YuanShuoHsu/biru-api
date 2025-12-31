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

import { UserResponseDto } from 'src/users/dto/user-response.dto';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type {
  RequestWithCookies,
  RequestWithGoogleUser,
  RequestWithRefreshUser,
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
  getProfile(@Request() req: RequestWithUser): UserResponseDto {
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
  async googleLoginCallback(
    @Ip() ip: string,
    @Query('state') state: string,
    @Request() req: RequestWithGoogleUser,
    @Res() res: Response,
  ) {
    const stateString = Buffer.from(state, 'base64').toString('utf-8');
    const query = JSON.parse(stateString) as Record<string, string>;

    const rememberMe = query.rememberMe === 'true';
    const userAgent = req.get('user-agent');

    const { access_token } = await this.authService.loginWithGoogle(
      req.user,
      { ip, rememberMe, userAgent },
      res,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lang, redirect, rememberMe: _ } = query;
    const params = new URLSearchParams({ token: access_token, redirect });

    const redirectUrl = `${process.env.NEXT_URL}/${lang || ''}/auth/callback?${params.toString()}`;
    res.redirect(redirectUrl);
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  @ApiOperation({ summary: '使用者憑證續期' })
  async refresh(
    @Ip() ip: string,
    @Request() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(req.user, { ip }, res);
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
