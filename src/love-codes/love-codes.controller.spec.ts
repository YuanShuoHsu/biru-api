import { Test, TestingModule } from '@nestjs/testing';
import { LoveCodesController } from './love-codes.controller';
import { LoveCodesService } from './love-codes.service';

describe('LoveCodesController', () => {
  let controller: LoveCodesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoveCodesController],
      providers: [LoveCodesService],
    }).compile();

    controller = module.get<LoveCodesController>(LoveCodesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
