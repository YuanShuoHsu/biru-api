import { Test, TestingModule } from '@nestjs/testing';

import { GcisService } from './gcis.service';

describe('GcisService', () => {
  let service: GcisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GcisService],
    }).compile();

    service = module.get<GcisService>(GcisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
