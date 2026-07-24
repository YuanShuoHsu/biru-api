import { IsString } from 'class-validator';

export class JoinOrderDto {
  @IsString()
  orderId: string;
}
