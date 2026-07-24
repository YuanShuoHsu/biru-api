import { IsString } from 'class-validator';

export class JoinOrdersBoardDto {
  @IsString()
  organizationId: string;
}
