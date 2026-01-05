import { Module } from '@nestjs/common';

import { MenusModule } from 'src/menus/menus.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [MenusModule],
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}
