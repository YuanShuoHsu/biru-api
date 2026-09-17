import { ApiProperty } from '@nestjs/swagger';

export class AttendanceIdResponseDto {
  @ApiProperty() id: string;
}
