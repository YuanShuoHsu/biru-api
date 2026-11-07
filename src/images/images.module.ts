import { Module } from '@nestjs/common';

import { ImageStorageService } from './image-storage.service.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, ImageStorageService],
  exports: [ImageStorageService],
})
export class ImagesModule {}
