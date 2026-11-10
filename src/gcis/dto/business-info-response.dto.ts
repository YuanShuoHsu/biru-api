import { ApiProperty } from '@nestjs/swagger';

export class BusinessInfoResponseDto {
  @ApiProperty() name: string;
  @ApiProperty() address: string;
  @ApiProperty() representativeName: string;
}
