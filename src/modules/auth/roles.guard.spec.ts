import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleType } from '../../common/enums';
import { RolesGuard } from './roles.guard';

const contextFor = (user: unknown, roles?: RoleType[]): ExecutionContext => {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata('roles', roles, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
};

const userWithRole = (name: string) => ({ id: 'u', role: { name } });

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows any authenticated user when the route declares no roles', () => {
    expect(guard.canActivate(contextFor(userWithRole(RoleType.SALES)))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const ctx = contextFor(userWithRole(RoleType.ADMIN), [RoleType.ADMIN, RoleType.SALES]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it.each([RoleType.SALES, RoleType.REVIEWER])('forbids %s on an ADMIN-only route', (role) => {
    expect(() => guard.canActivate(contextFor(userWithRole(role), [RoleType.ADMIN]))).toThrow(
      ForbiddenException,
    );
  });

  it.each([
    ['no user on the request', undefined],
    ['a user without a role', { id: 'u' }],
    ['an unknown role name', userWithRole('SUPERUSER')],
    ['a lower-cased role name', userWithRole('admin')],
  ])('forbids %s', (_label, user) => {
    expect(() => guard.canActivate(contextFor(user, [RoleType.ADMIN]))).toThrow(ForbiddenException);
  });
});
