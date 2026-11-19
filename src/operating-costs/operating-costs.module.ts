import { Module } from '@nestjs/common';

import { OperatingCostsController } from './operating-costs.controller.js';
import { OperatingCostsService } from './operating-costs.service.js';

@Module({
  controllers: [OperatingCostsController],
  providers: [OperatingCostsService],
})
export class OperatingCostsModule {}
