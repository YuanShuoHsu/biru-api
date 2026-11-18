import { Module } from '@nestjs/common';

import { MailsModule } from '../mails/mails.module.js';

import { AdminPointReportsController } from './admin-point-reports.controller.js';
import { AdminPointSettingsController } from './admin-point-settings.controller.js';
import { MyPointsController } from './my-points.controller.js';
import { OrganizationPointsController } from './organization-points.controller.js';
import { PointReportsService } from './point-reports.service.js';
import { PointSettingsController } from './point-settings.controller.js';
import { PointSettingsService } from './point-settings.service.js';
import { PointsService } from './points.service.js';

@Module({
  imports: [MailsModule],
  controllers: [
    AdminPointReportsController,
    AdminPointSettingsController,
    MyPointsController,
    OrganizationPointsController,
    PointSettingsController,
  ],
  providers: [PointReportsService, PointSettingsService, PointsService],
  exports: [PointsService],
})
export class PointsModule {}
