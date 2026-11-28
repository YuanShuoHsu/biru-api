import { IsNotEmpty, IsString } from 'class-validator';

export class PurchasedTodayQueryDto {
  @IsString()
  @IsNotEmpty()
  organizationSlug: string;
}

export class PurchasedTodayDto {
  menuItemId: string;

  quantity: number;
}
