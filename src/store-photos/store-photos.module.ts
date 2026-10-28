import { Module } from '@nestjs/common';

import { AdminStorePhotosController } from './admin-store-photos.controller.js';
import { StorePhotosController } from './store-photos.controller.js';
import { StorePhotosService } from './store-photos.service.js';

@Module({
  controllers: [StorePhotosController, AdminStorePhotosController],
  providers: [StorePhotosService],
})
export class StorePhotosModule {}
