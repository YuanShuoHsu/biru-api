import { ApiProperty } from '@nestjs/swagger';

import { Matches } from 'class-validator';

export class EmployerHealthSupplementQueryDto {
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month: string;
}

export class EmployerHealthSupplementResponseDto {
  @ApiProperty() month: string;
  @ApiProperty() salaryCents: string;
  @ApiProperty() insuredCents: string;
  @ApiProperty() premiumCents: string;
  @ApiProperty() unpublishedEmployees: number;
}
