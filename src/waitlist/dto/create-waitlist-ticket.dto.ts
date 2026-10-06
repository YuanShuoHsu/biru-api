import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWaitlistTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  partySize: number;

  @ApiProperty({ description: 'E.164', example: '+886912345678' })
  @IsPhoneNumber()
  phoneNumber: string;
}
