import { Test, TestingModule } from '@nestjs/testing';
import { LoveCodesService } from './love-codes.service';

describe('LoveCodesService', () => {
  let service: LoveCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoveCodesService],
    }).compile();

    service = module.get<LoveCodesService>(LoveCodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
