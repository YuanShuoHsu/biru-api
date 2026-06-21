import { Module } from '@nestjs/common';

import { GcisController } from './gcis.controller';
import { GcisService } from './gcis.service';

@Module({
  controllers: [GcisController],
  providers: [GcisService],
})
export class GcisModule {}
