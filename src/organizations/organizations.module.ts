import { Module } from '@nestjs/common';

import { AuthBatchService } from '../auth/auth-batch.service.js';
import { EcpayModule } from '../ecpay/ecpay.module.js';
import { MailsModule } from '../mails/mails.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { WaitlistModule } from '../waitlist/waitlist.module.js';

import { MyOrganizationStatsController } from './my-organization-stats.controller.js';
import { MyOrganizationsController } from './my-organizations.controller.js';
import { OrganizationBatchController } from './organization-batch.controller.js';
import { OrganizationClosureController } from './organization-closure.controller.js';
import { OrganizationOperatingTypeController } from './organization-operating-type.controller.js';
import { OrganizationPlatformAdminController } from './organization-platform-admin.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import { SpecialHoursController } from './special-hours.controller.js';
import { SpecialHoursService } from './special-hours.service.js';

@Module({
  imports: [EcpayModule, MailsModule, OrdersModule, WaitlistModule],
  controllers: [
    MyOrganizationStatsController,
    MyOrganizationsController,
    OrganizationBatchController,
    OrganizationClosureController,
    OrganizationOperatingTypeController,
    OrganizationPlatformAdminController,
    OrganizationsController,
    SpecialHoursController,
  ],
  providers: [AuthBatchService, OrganizationsService, SpecialHoursService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
