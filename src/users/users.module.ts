import { Module } from '@nestjs/common';

import { AuthBatchService } from 'src/auth/auth-batch.service';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [],
  controllers: [UsersController],
  providers: [AuthBatchService, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
