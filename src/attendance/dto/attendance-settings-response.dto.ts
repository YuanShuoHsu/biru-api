import { ApiProperty } from '@nestjs/swagger';

import { SaveAttendanceSettingsDto } from './save-attendance-settings.dto.js';

export class AttendanceSettingsResponseDto extends SaveAttendanceSettingsDto {
  @ApiProperty() organizationId: string;
  @ApiProperty() updatedAt: Date;
}
