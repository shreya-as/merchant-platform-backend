import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoleType } from '../../../common/enums';
import { LoginDto, RegisterDto } from './auth.dto';

const errorsFor = async <T extends object>(cls: new () => T, body: object) =>
  (await validate(plainToInstance(cls, body))).map((e) => e.property);

describe('LoginDto', () => {
  it('accepts email + password', async () => {
    expect(await errorsFor(LoginDto, { email: 'a@b.com', password: 'x' })).toEqual([]);
  });

  it('rejects a malformed email, an empty password and an oversized password', async () => {
    expect(await errorsFor(LoginDto, { email: 'nope', password: '' })).toEqual(['email', 'password']);
    expect(await errorsFor(LoginDto, { email: 'a@b.com', password: 'x'.repeat(129) })).toEqual([
      'password',
    ]);
  });
});

describe('RegisterDto', () => {
  const valid = { email: 'a@b.com', password: 'longenough', role: RoleType.REVIEWER };

  it('accepts a valid staff account', async () => {
    expect(await errorsFor(RegisterDto, valid)).toEqual([]);
  });

  it.each([
    ['password', 'short'],
    ['password', 'x'.repeat(73)], // bcrypt only uses 72 bytes
    ['role', 'SUPERUSER'],
    ['email', 'not-an-email'],
  ])('rejects an invalid %s', async (field, value) => {
    expect(await errorsFor(RegisterDto, { ...valid, [field]: value })).toEqual([field]);
  });
});
