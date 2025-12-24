import { Module } from '@nestjs/common';

import { MailModule } from 'src/mail/mail.module';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
