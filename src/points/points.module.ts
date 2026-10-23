import { Module } from '@nestjs/common';

import { MyPointsController } from './my-points.controller.js';
import { OrganizationPointsController } from './organization-points.controller.js';
import { PointsService } from './points.service.js';

@Module({
  controllers: [MyPointsController, OrganizationPointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
