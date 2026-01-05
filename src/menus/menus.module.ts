import { Module } from '@nestjs/common';

import { MenusGateway } from './menus.gateway';
import { MenusService } from './menus.service';

@Module({
  providers: [MenusGateway, MenusService],
  exports: [MenusService],
})
export class MenusModule {}
