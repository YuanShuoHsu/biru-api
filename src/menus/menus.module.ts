import { Module } from '@nestjs/common';

import { PublicMenusService } from './menus-public.service';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  controllers: [MenusController],
  providers: [MenusService, PublicMenusService],
  exports: [MenusService, PublicMenusService],
})
export class MenusModule {}
