import { Module } from '@nestjs/common';

import { MyPointsController } from './my-points.controller';
import { PointsService } from './points.service';

@Module({
  controllers: [MyPointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
