// https://docs.nestjs.com/security/authentication

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AccountsModule } from 'src/accounts/accounts.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { UsersModule } from 'src/users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import jwtConstantsConfig from './jwtConstants.config';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    AccountsModule,
    ConfigModule.forFeature(jwtConstantsConfig),
    JwtModule.registerAsync({
      ...jwtConstantsConfig.asProvider(),
      useFactory: (jwtConstants: ConfigType<typeof jwtConstantsConfig>) => ({
        secret: jwtConstants.access.secret,
        signOptions: { expiresIn: jwtConstants.access.expiresIn },
      }),
    }),
    PassportModule,
    SessionsModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    LocalStrategy,
    JwtRefreshAuthGuard,
    JwtRefreshStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
