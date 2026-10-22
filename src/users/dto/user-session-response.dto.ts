import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSessionResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ nullable: true }) ipAddress: string | null;
  @ApiPropertyOptional({ nullable: true }) userAgent: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() expiresAt: Date;
}

export class UserSessionListResponseDto {
  @ApiProperty({ type: [UserSessionResponseDto] })
  data: UserSessionResponseDto[];
  @ApiProperty() total: number;
}
