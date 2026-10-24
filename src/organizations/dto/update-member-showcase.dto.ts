import { ApiProperty } from '@nestjs/swagger';

import { IsBoolean } from 'class-validator';

export class UpdateMemberShowcaseDto {
  @ApiProperty({ description: '是否顯示在官網「關於我們」的團隊介紹' })
  @IsBoolean()
  showcase: boolean;
}
