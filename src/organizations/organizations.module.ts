import { Module } from '@nestjs/common';

import { AuthBatchService } from '../auth/auth-batch.service.js';

import { MyOrganizationStatsController } from './my-organization-stats.controller.js';
import { MyOrganizationsController } from './my-organizations.controller.js';
import { OrganizationBatchController } from './organization-batch.controller.js';
import { OrganizationClosureController } from './organization-closure.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [
    MyOrganizationStatsController,
    MyOrganizationsController,
    OrganizationBatchController,
    OrganizationClosureController,
    OrganizationsController,
  ],
  providers: [AuthBatchService, OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
