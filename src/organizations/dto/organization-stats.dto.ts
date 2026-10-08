import { ApiProperty } from '@nestjs/swagger';

export class OrganizationStatsBucketDto {
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty() organizations: number;
}

export class OrganizationStatsResponseDto {
  @ApiProperty({ description: '組織數；平台管理員為全平台，其他人為所屬組織' })
  total: number;

  @ApiProperty({ type: [OrganizationStatsBucketDto] })
  buckets: OrganizationStatsBucketDto[];

  @ApiProperty({ description: '上期新建立的組織數（範圍同 total）' })
  previous: number;
}
