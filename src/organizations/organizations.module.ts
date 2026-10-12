import { Module } from '@nestjs/common';

import { MyOrganizationStatsController } from './my-organization-stats.controller';
import { OrganizationClosureController } from './organization-closure.controller';
import { OrganizationDeletabilityController } from './organization-deletability.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [
    MyOrganizationStatsController,
    OrganizationClosureController,
    OrganizationDeletabilityController,
    OrganizationsController,
  ],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
