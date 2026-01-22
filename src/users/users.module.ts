import { Module } from '@nestjs/common';

import { MailsModule } from 'src/mails/mails.module';
import { VerificationsModule } from 'src/verifications/verifications.module';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [MailsModule, VerificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
