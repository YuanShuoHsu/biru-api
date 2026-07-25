import { Module } from '@nestjs/common';

import { AdminBannersController } from './admin-banners.controller';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  controllers: [BannersController, AdminBannersController],
  providers: [BannersService],
})
export class BannersModule {}
