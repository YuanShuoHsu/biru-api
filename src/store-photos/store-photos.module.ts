import { Module } from '@nestjs/common';

import { ImagesModule } from '../images/images.module.js';

import { AdminStorePhotosController } from './admin-store-photos.controller.js';
import { StorePhotosController } from './store-photos.controller.js';
import { StorePhotosService } from './store-photos.service.js';

@Module({
  imports: [ImagesModule],
  controllers: [StorePhotosController, AdminStorePhotosController],
  providers: [StorePhotosService],
})
export class StorePhotosModule {}
