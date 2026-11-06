import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
} from 'class-validator';

import { ADMIN_BOARD_COLUMN_LIMIT } from '../../common/constants/board.js';

export class ApplyTransitionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_BOARD_COLUMN_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  orderIds: string[];
}
