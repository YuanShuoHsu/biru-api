import { ApiProperty, OmitType } from '@nestjs/swagger';

import { ImageParamsDto } from '../../images/dto/image-params.dto.js';

export class UserImageParamsDto extends OmitType(ImageParamsDto, [
  'kind',
] as const) {
  @ApiProperty({ description: '頭像內容的雜湊' })
  version: string;
}
