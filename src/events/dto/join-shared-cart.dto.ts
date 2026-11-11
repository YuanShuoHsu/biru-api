import { IsString } from 'class-validator';

export class JoinSharedCartDto {
  @IsString()
  organizationId: string;

  @IsString()
  accessToken: string;
}
