import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RoleType } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const users = { findOne: jest.fn() };
  const config = { get: () => 'x'.repeat(48) } as unknown as ConfigService;
  const strategy = new JwtStrategy(users as unknown as Repository<User>, config);

  beforeEach(() => users.findOne.mockReset());

  it('loads the user from the database instead of trusting the role claim', async () => {
    const dbUser = { id: 'user-1', role: { name: RoleType.SALES } };
    users.findOne.mockResolvedValue(dbUser);

    // Token claims ADMIN, but the database says SALES: the database wins.
    const result = await strategy.validate({ sub: 'user-1', email: 'x@y.com', role: RoleType.ADMIN });

    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toBe(dbUser);
    expect(result.role.name).toBe(RoleType.SALES);
  });

  it('rejects a token for a user that no longer exists', async () => {
    users.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'deleted', email: 'x@y.com', role: RoleType.ADMIN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to start without a JWT secret', () => {
    const missing = { get: () => undefined } as unknown as ConfigService;

    expect(() => new JwtStrategy(users as unknown as Repository<User>, missing)).toThrow(/JWT_SECRET/);
  });
});
