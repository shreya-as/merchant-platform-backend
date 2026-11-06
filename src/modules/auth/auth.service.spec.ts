import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { RoleType } from '../../common/enums';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

const SALT_ROUNDS = 4; // fast hashing for tests

describe('AuthService', () => {
  let service: AuthService;
  let users: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let roles: { findOne: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let storedUser: User;

  beforeAll(async () => {
    storedUser = {
      id: 'user-1',
      email: 'sales@merchantplatform.com',
      password_hash: await bcrypt.hash('test-only-password', SALT_ROUNDS),
      role_id: 'role-sales',
      role: { id: 'role-sales', name: RoleType.SALES },
    } as User;
  });

  beforeEach(async () => {
    users = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (entity) => ({ id: 'new-user', ...entity })),
    };
    roles = { findOne: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Role), useValue: roles },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => SALT_ROUNDS } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns a token whose claims come from the stored user, plus a public profile', async () => {
      users.findOne.mockResolvedValue(storedUser);

      const result = await service.login({ email: 'SALES@merchantplatform.com', password: 'test-only-password' });

      expect(users.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'sales@merchantplatform.com' } }),
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'sales@merchantplatform.com',
        role: RoleType.SALES,
      });
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        user: { id: 'user-1', email: 'sales@merchantplatform.com', role: RoleType.SALES },
      });
      expect(JSON.stringify(result)).not.toContain('password');
    });

    it('rejects a wrong password with a generic 401', async () => {
      users.findOne.mockResolvedValue(storedUser);

      await expect(service.login({ email: storedUser.email, password: 'wrong' })).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same 401 (no user enumeration)', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@x.com', password: 'whatever' })).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('hashes the password, lower-cases the email and never returns the hash', async () => {
      const role = { id: 'role-reviewer', name: RoleType.REVIEWER };
      roles.findOne.mockResolvedValue(role);

      const result = await service.register({
        email: 'New.Reviewer@X.com',
        password: 'Sup3rSecret!',
        role: RoleType.REVIEWER,
      });

      const created = users.create.mock.calls[0][0];
      expect(created.email).toBe('new.reviewer@x.com');
      expect(created.password_hash).not.toBe('Sup3rSecret!');
      await expect(bcrypt.compare('Sup3rSecret!', created.password_hash)).resolves.toBe(true);
      expect(result).toEqual({ id: 'new-user', email: 'new.reviewer@x.com', role: RoleType.REVIEWER });
    });

    it('rejects a role that is not configured', async () => {
      roles.findOne.mockResolvedValue(null);

      await expect(
        service.register({ email: 'a@b.com', password: 'Sup3rSecret!', role: RoleType.ADMIN }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a duplicate email to 409', async () => {
      roles.findOne.mockResolvedValue({ id: 'r', name: RoleType.SALES });
      users.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.register({ email: 'a@b.com', password: 'Sup3rSecret!', role: RoleType.SALES }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
