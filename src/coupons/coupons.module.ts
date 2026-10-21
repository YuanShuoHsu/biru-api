import { Module } from '@nestjs/common';

import { OrderPricingModule } from '../orders/order-pricing.module.js';

import { AdminCouponsController } from './admin-coupons.controller.js';
import { CouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';
import { MyCouponsController } from './my-coupons.controller.js';
import { OrganizationCouponsController } from './organization-coupons.controller.js';

@Module({
  imports: [OrderPricingModule],
  controllers: [
    AdminCouponsController,
    CouponsController,
    MyCouponsController,
    OrganizationCouponsController,
  ],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
