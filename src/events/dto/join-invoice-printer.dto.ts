import { IsBoolean, IsString } from 'class-validator';

export class JoinInvoicePrinterDto {
  @IsString()
  deviceId: string;

  @IsString()
  organizationId: string;

  @IsBoolean()
  takeover: boolean;
}
