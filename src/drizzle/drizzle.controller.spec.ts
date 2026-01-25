import { Test, TestingModule } from '@nestjs/testing';
import { DrizzleController } from './drizzle.controller';
import { DrizzleService } from './drizzle.service';

describe('DrizzleController', () => {
  let controller: DrizzleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DrizzleController],
      providers: [DrizzleService],
    }).compile();

    controller = module.get<DrizzleController>(DrizzleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
