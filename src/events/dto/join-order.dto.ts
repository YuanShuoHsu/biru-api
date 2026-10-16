import { IsOptional, IsString } from 'class-validator';

export class JoinOrderDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}
