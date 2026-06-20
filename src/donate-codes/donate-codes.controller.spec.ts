import { Test, TestingModule } from '@nestjs/testing';

import { DonateCodesController } from './donate-codes.controller';
import { DonateCodesService } from './donate-codes.service';

describe('DonateCodesController', () => {
  let controller: DonateCodesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DonateCodesController],
      providers: [DonateCodesService],
    }).compile();

    controller = module.get<DonateCodesController>(DonateCodesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
