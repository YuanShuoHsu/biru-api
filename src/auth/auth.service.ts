import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { User } from '@prisma/client';
import { UsersService } from 'src/users/users.service';

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
  }: Pick<User, 'email'> &
    Partial<
      Pick<User, 'firstName' | 'lastName' | 'photo'>
    >): Promise<User | null> {
    if (!email) return null;

    let user = await this.usersService.user({ email });

    if (!user) {
      user = await this.usersService.createUser({
        email,
        firstName,
        lastName,
        password: '',
        photo,
        provider: 'google',
      });
    }

    return user;
  }

  async login(user: Omit<User, 'password'>): Promise<{ access_token: string }> {
    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
