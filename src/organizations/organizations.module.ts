import { Module } from '@nestjs/common';

import { AuthBatchService } from 'src/auth/auth-batch.service';

import { MyOrganizationStatsController } from './my-organization-stats.controller';
import { OrganizationBatchController } from './organization-batch.controller';
import { OrganizationClosureController } from './organization-closure.controller';
import { OrganizationDeletabilityController } from './organization-deletability.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [
    MyOrganizationStatsController,
    OrganizationBatchController,
    OrganizationClosureController,
    OrganizationDeletabilityController,
    OrganizationsController,
  ],
  providers: [AuthBatchService, OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
