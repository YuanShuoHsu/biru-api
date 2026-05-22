import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationMemberTeamDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class OrganizationMemberResponseDto {
  @ApiPropertyOptional()
  bio: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  image: string | null;

  @ApiPropertyOptional()
  lastName: string | null;

  @ApiProperty()
  role: string;

  @ApiProperty({ type: [OrganizationMemberTeamDto] })
  teams: OrganizationMemberTeamDto[];

  @ApiProperty()
  userId: string;
}
