import { Module } from '@nestjs/common';

import { AdminStoresController } from './admin-stores.controller';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  controllers: [StoresController, AdminStoresController],
  providers: [StoresService],
})
export class StoresModule {}
