import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();

export const jwtConstants = {
  access: {
    secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    expiresIn: configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
  },
  refresh: {
    secret: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    expiresIn: configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
  },
};
