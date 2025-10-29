import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ description: '是否成功登出', example: true })
  success: boolean;
}
