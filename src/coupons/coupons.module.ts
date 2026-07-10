import { Module } from '@nestjs/common';

import { OrderPricingModule } from '../orders/order-pricing.module';

import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { MyCouponsController } from './my-coupons.controller';

@Module({
  imports: [OrderPricingModule],
  controllers: [CouponsController, MyCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
