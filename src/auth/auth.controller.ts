import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { CreateAuthDto } from './dto/create-auth.dto';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RequestWithUser } from './types';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: '登入並取得 JWT' })
  async login(
    @Body() _dto: CreateAuthDto,
    @Request() req: RequestWithUser,
  ): Promise<AuthResponseDto> {
    return this.authService.login(req.user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleLogin() {}

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  googleLoginCallback(@Request() req: RequestWithUser) {
    return this.authService.login(req.user);
  }

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
