import { IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationWifiDto {
  @IsString()
  @MaxLength(32)
  ssid: string;

  @IsString()
  @MaxLength(63)
  password: string;
}

export class OrganizationWifiResponseDto {
  ssid: string;

  password: string;
}
