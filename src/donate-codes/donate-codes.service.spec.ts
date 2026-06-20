import { Test, TestingModule } from '@nestjs/testing';

import { DonateCodesService } from './donate-codes.service';

describe('DonateCodesService', () => {
  let service: DonateCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DonateCodesService],
    }).compile();

    service = module.get<DonateCodesService>(DonateCodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
