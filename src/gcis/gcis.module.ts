import { Module } from '@nestjs/common';

import { GcisController } from './gcis.controller.js';
import { GcisService } from './gcis.service.js';

@Module({
  controllers: [GcisController],
  providers: [GcisService],
})
export class GcisModule {}
