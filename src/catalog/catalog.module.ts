import { Module } from '@nestjs/common';

import { ImagesModule } from '../images/images.module.js';

import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [ImagesModule],
  controllers: [AdminCatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
