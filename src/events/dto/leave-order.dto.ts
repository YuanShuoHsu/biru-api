import { IsString } from 'class-validator';

export class LeaveOrderDto {
  @IsString()
  orderId: string;
}
