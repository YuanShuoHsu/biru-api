import { Module } from '@nestjs/common';

import { AdminImagesController } from './admin-images.controller.js';
import { ImageOrphansService } from './image-orphans.service.js';
import { ImageStorageService } from './image-storage.service.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
  controllers: [ImagesController, AdminImagesController],
  providers: [ImagesService, ImageStorageService, ImageOrphansService],
  exports: [ImageStorageService],
})
export class ImagesModule {}
