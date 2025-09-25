import { Test, TestingModule } from '@nestjs/testing';

import { MenusGateway } from './menus.gateway';
import { MenusService } from './menus.service';

describe('MenusGateway', () => {
  let gateway: MenusGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenusGateway, MenusService],
    }).compile();

    gateway = module.get<MenusGateway>(MenusGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
