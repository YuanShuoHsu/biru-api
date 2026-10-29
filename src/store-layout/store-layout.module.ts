import { Module } from '@nestjs/common';

import { StoreLayoutController } from './store-layout.controller.js';
import { StoreLayoutService } from './store-layout.service.js';

@Module({
  controllers: [StoreLayoutController],
  providers: [StoreLayoutService],
})
export class StoreLayoutModule {}
