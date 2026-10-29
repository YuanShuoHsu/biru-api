import { ApiProperty, PickType } from '@nestjs/swagger';

export class PointSettingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) amountPerPoint: string | null;
  @ApiProperty({ nullable: true, type: Number })
  pointsValidityYears: number | null;
  @ApiProperty({ nullable: true, type: Date }) pointsEnabledAt: Date | null;
  @ApiProperty({ nullable: true, type: String })
  accountingValuePerPoint: string | null;
  @ApiProperty() updatedAt: Date;
}

export class PublicPointSettingResponseDto extends PickType(
  PointSettingResponseDto,
  ['amountPerPoint', 'pointsValidityYears'] as const,
) {
  @ApiProperty() enabled: boolean;
}
