import { Module } from '@nestjs/common';

import { AdminPointSettingsController } from './admin-point-settings.controller.js';
import { MyPointsController } from './my-points.controller.js';
import { OrganizationPointsController } from './organization-points.controller.js';
import { PointSettingsController } from './point-settings.controller.js';
import { PointSettingsService } from './point-settings.service.js';
import { PointsService } from './points.service.js';

@Module({
  controllers: [
    AdminPointSettingsController,
    MyPointsController,
    OrganizationPointsController,
    PointSettingsController,
  ],
  providers: [PointSettingsService, PointsService],
  exports: [PointsService],
})
export class PointsModule {}
