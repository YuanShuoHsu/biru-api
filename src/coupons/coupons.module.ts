import { Module } from '@nestjs/common';

import { OrderPricingModule } from '../orders/order-pricing.module';

import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { MyCouponsController } from './my-coupons.controller';

@Module({
  imports: [OrderPricingModule],
  controllers: [AdminCouponsController, CouponsController, MyCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
