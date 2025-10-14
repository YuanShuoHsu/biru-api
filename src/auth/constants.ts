import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();

export const jwtConstants = {
  secret: configService.getOrThrow<string>('JWT_SECRET'),
};
