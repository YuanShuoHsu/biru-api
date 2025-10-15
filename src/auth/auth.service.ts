import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Provider, User } from '@prisma/client';

import { UsersService } from 'src/users/users.service';

interface GoogleUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  photo?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.user({ email });
    if (!user) return null;

    const { password, ...result } = user;
    const isMatch = await bcrypt.compare(pass, password);
    if (!isMatch) return null;

    return result;
  }

  async validateGoogleUser({
    email,
    firstName,
    lastName,
    photo,
  }: GoogleUserInput): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.user({ email });

    if (!user) {
      const tempPassword = crypto.randomBytes(16).toString('hex');

      const createUser = await this.usersService.createUser({
        email,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(photo ? { photo } : {}),
        password: tempPassword,
        provider: Provider.google,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = createUser;
      return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  async login(user: User): Promise<{ access_token: string }> {
    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
