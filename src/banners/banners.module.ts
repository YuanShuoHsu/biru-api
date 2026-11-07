import { Module } from '@nestjs/common';

import { ImagesModule } from '../images/images.module.js';

import { AdminBannersController } from './admin-banners.controller.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';

@Module({
  imports: [ImagesModule],
  controllers: [BannersController, AdminBannersController],
  providers: [BannersService],
})
export class BannersModule {}
