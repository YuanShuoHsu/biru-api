import { ApiProperty } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: '192d355c-3a2c-4587-ae86-3fd754c2e8ed' })
  id: string;

  @ApiProperty({ example: 'birucoffee@example.com' })
  email: string;
}
