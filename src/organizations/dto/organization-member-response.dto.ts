import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import {
  memberRoleEnum,
  type MemberRole,
} from '../../db/schema/organizations.js';

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

  @ApiProperty({ enum: memberRoleEnum.enumValues })
  role: MemberRole;

  @ApiProperty({ description: '是否顯示在官網「關於我們」的團隊介紹' })
  showcase: boolean;

  @ApiProperty({ type: [OrganizationMemberTeamDto] })
  teams: OrganizationMemberTeamDto[];

  @ApiProperty()
  userId: string;
}

export class OrganizationTeamMemberResponseDto extends OmitType(
  OrganizationMemberResponseDto,
  ['createdAt', 'showcase', 'userId'] as const,
) {}

export class MemberShowcaseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: '是否顯示在官網「關於我們」的團隊介紹' })
  showcase: boolean;
}
