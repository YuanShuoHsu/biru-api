import { Module } from '@nestjs/common';

import { MyOrganizationStatsController } from './my-organization-stats.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [MyOrganizationStatsController, OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
