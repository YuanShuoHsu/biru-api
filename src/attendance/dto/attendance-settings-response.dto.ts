import { ApiProperty } from '@nestjs/swagger';

import { SaveAttendanceSettingsDto } from './save-attendance-settings.dto';

export class AttendanceSettingsResponseDto extends SaveAttendanceSettingsDto {
  @ApiProperty() organizationId: string;
  @ApiProperty() updatedAt: Date;
}
