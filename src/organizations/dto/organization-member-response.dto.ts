import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationMemberResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  firstName: string;

  @ApiPropertyOptional()
  lastName: string | null;

  @ApiPropertyOptional()
  image: string | null;
}
