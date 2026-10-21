import { Module } from '@nestjs/common';

import { AuthBatchService } from '../auth/auth-batch.service.js';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [],
  controllers: [UsersController],
  providers: [AuthBatchService, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
