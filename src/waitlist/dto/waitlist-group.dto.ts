import { ApiProperty } from '@nestjs/swagger';

import { IsInt, Matches, Max, Min } from 'class-validator';

export class WaitlistGroupDto {
  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(99)
  maxPartySize: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(99)
  minPartySize: number;

  @ApiProperty({ example: 'B' })
  @Matches(/^[A-Z]$/)
  prefix: string;
}
