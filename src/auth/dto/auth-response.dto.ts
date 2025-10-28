import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT Access Token',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjE4LCJlbWFpbCI6ImJpcnVjb2ZmZWVAZXhhbXBsZS5jb20iLCJpYXQiOjE3NjA2ODg0MzIsImV4cCI6MTc2MDY4ODQ5Mn0.fdEEVgcT1JBOnAy8DcoLWzDvs82L3dtp9AETonvxIIc',
  })
  access_token: string;
}
