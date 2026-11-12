import { ApiProperty } from '@nestjs/swagger';

import { IsBoolean } from 'class-validator';

export class SetOrderItemPreparedDto {
  @ApiProperty({ description: 'true 標記做好，false 取消標記' })
  @IsBoolean()
  prepared: boolean;
}
