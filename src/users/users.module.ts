import { Module } from '@nestjs/common';

import { MailsModule } from 'src/mails/mails.module';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [MailsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
