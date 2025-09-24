import { Module } from '@nestjs/common';

import { MenuGateway } from './menu.gateway';
import { MenuService } from './menu.service';

@Module({
  providers: [MenuGateway, MenuService],
})
export class MenuModule {}
