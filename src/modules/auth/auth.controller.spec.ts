import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RoleType } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    login: jest.fn().mockResolvedValue({ accessToken: 't' }),
    register: jest.fn().mockResolvedValue({ id: 'u' }),
    toPublicUser: jest.fn().mockReturnValue({ id: 'u' }),
  };
  const guardsOf = (handler: keyof AuthController) =>
    Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype[handler]) as unknown[] | undefined;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('leaves login public', () => {
    expect(guardsOf('login')).toBeUndefined();
  });

  it('restricts register to authenticated ADMIN users', () => {
    expect(guardsOf('register')).toHaveLength(2);
    expect(guardsOf('register')).toContain(RolesGuard);
    expect(new Reflector().get(ROLES_KEY, AuthController.prototype.register)).toEqual([RoleType.ADMIN]);
  });

  it('requires authentication for me', () => {
    expect(guardsOf('me')).toHaveLength(1);
  });

  it('delegates to the service', async () => {
    const login = { email: 'a@b.com', password: 'p' };
    await expect(controller.login(login)).resolves.toEqual({ accessToken: 't' });
    expect(service.login).toHaveBeenCalledWith(login);

    const register = { email: 'a@b.com', password: 'longenough', role: RoleType.SALES };
    await controller.register(register);
    expect(service.register).toHaveBeenCalledWith(register);

    const user = { id: 'u' } as User;
    expect(controller.me(user)).toEqual({ id: 'u' });
    expect(service.toPublicUser).toHaveBeenCalledWith(user);
  });
});
