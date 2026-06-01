import { Module } from '@nestjs/common';

import { PublicMenusController } from './menus-public.controller';
import { PublicMenusService } from './menus-public.service';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  controllers: [MenusController, PublicMenusController],
  providers: [MenusService, PublicMenusService],
  exports: [MenusService, PublicMenusService],
})
export class MenusModule {}
