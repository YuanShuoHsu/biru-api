import { Test, TestingModule } from '@nestjs/testing';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

describe('VerificationsController', () => {
  let controller: VerificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerificationsController],
      providers: [VerificationsService],
    }).compile();

    controller = module.get<VerificationsController>(VerificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
