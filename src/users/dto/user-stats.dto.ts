import { ApiProperty } from '@nestjs/swagger';

export class UserStatsBucketDto {
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty() users: number;
}

export class UserStatsResponseDto {
  @ApiProperty({ description: '平台全部使用者數' }) total: number;

  @ApiProperty({ type: [UserStatsBucketDto] })
  buckets: UserStatsBucketDto[];

  @ApiProperty({ description: '上期新增使用者數' }) previous: number;
}
