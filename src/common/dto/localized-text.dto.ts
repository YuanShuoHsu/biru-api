import { ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

export class LocalizedTextDto implements LocalizedText {
  @ApiPropertyOptional() en?: string;
  @ApiPropertyOptional() ja?: string;
  @ApiPropertyOptional() ko?: string;
  @ApiPropertyOptional() 'zh-CN'?: string;
  @ApiPropertyOptional() 'zh-TW'?: string;
}
