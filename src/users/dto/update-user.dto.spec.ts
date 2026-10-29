import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserDto } from './update-user.dto.js';

const invalidProperties = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateUserDto, body))).map(
    ({ property }) => property,
  );

describe('UpdateUserDto', () => {
  it('accepts a partial update', async () => {
    expect(await invalidProperties({ firstName: 'Coffee' })).toEqual([]);
  });

  it('accepts a full update', async () => {
    expect(
      await invalidProperties({
        birthDate: '2024-04-04',
        emailSubscribed: true,
        firstName: 'Coffee',
        gender: 'male',
        image: 'https://example.com/avatar.png',
        lastName: 'Biru',
        phoneNumber: '+886912345678',
      }),
    ).toEqual([]);
  });

  it.each([
    [{ firstName: 123 }, 'firstName'],
    [{ firstName: '' }, 'firstName'],
    [{ lastName: 123 }, 'lastName'],
    [{ phoneNumber: 886912345678 }, 'phoneNumber'],
    [{ phoneNumber: '' }, 'phoneNumber'],
  ])('rejects %j', async (body, property) => {
    expect(await invalidProperties(body)).toEqual([property]);
  });
});
