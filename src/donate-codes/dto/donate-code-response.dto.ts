import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DonateCodeResponseDto {
  @ApiProperty() donateNm: string;
  @ApiProperty() donateCode: string;
  @ApiPropertyOptional() donateShortNm?: string;
}
