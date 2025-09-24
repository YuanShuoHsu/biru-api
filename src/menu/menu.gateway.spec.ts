import { Test, TestingModule } from '@nestjs/testing';

import { MenuGateway } from './menu.gateway';
import { MenuService } from './menu.service';

describe('MenuGateway', () => {
  let gateway: MenuGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuGateway, MenuService],
    }).compile();

    gateway = module.get<MenuGateway>(MenuGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
