import { Test, TestingModule } from '@nestjs/testing';

import { GcisController } from './gcis.controller';
import { GcisService } from './gcis.service';

describe('GcisController', () => {
  let controller: GcisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcisController],
      providers: [GcisService],
    }).compile();

    controller = module.get<GcisController>(GcisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
