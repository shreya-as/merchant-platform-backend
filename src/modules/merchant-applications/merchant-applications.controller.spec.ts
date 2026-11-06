import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleType } from '../../common/enums';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { MerchantApplicationsController } from './merchant-applications.controller';
import { MerchantApplicationsService } from './merchant-applications.service';

const USER = { id: 'user-1', role: { name: RoleType.SALES } } as User;
const ID = '11111111-1111-4111-8111-111111111111';

describe('MerchantApplicationsController', () => {
  let controller: MerchantApplicationsController;
  let service: Record<string, jest.Mock>;
  const reflector = new Reflector();
  const rolesOf = (handler: keyof MerchantApplicationsController) =>
    reflector.get<RoleType[] | undefined>(ROLES_KEY, MerchantApplicationsController.prototype[handler]);

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue('created'),
      findAll: jest.fn().mockResolvedValue('list'),
      findOne: jest.fn().mockResolvedValue('one'),
      update: jest.fn().mockResolvedValue('updated'),
      submit: jest.fn().mockResolvedValue('submitted'),
      assignReviewer: jest.fn().mockResolvedValue('assigned'),
      requeueRiskReview: jest.fn().mockResolvedValue('requeued'),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantApplicationsController],
      providers: [{ provide: MerchantApplicationsService, useValue: service }],
    }).compile();

    controller = module.get(MerchantApplicationsController);
  });

  describe('authorization metadata', () => {
    it('protects every route with JWT authentication and the roles guard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, MerchantApplicationsController);
      expect(guards).toHaveLength(2);
      expect(guards).toContain(RolesGuard);
    });

    it.each([
      ['create', [RoleType.ADMIN, RoleType.SALES]],
      ['update', [RoleType.ADMIN, RoleType.SALES]],
      ['submit', [RoleType.ADMIN, RoleType.SALES]],
      ['assign', [RoleType.ADMIN]],
      ['retryRiskReview', [RoleType.ADMIN]],
    ] as const)('%s is limited to %j', (handler, roles) => {
      expect(rolesOf(handler)).toEqual(roles);
    });

    it.each(['findAll', 'findOne'] as const)(
      '%s is open to any authenticated role (ownership is enforced in the service)',
      (handler) => {
        expect(rolesOf(handler)).toBeUndefined();
      },
    );
  });

  describe('delegation', () => {
    it('passes the current user through to the service', async () => {
      const dto = { businessName: 'Acme' } as never;

      await expect(controller.create(dto, USER)).resolves.toBe('created');
      expect(service.create).toHaveBeenCalledWith(dto, USER);

      await controller.findAll(USER, { page: 2 });
      expect(service.findAll).toHaveBeenCalledWith(USER, { page: 2 });

      await controller.findOne(ID, USER);
      expect(service.findOne).toHaveBeenCalledWith(ID, USER);

      await controller.update(ID, dto, USER);
      expect(service.update).toHaveBeenCalledWith(ID, dto, USER);

      await controller.submit(ID, USER);
      expect(service.submit).toHaveBeenCalledWith(ID, USER);

      await controller.retryRiskReview(ID, USER);
      expect(service.requeueRiskReview).toHaveBeenCalledWith(ID, USER);
    });

    it('assign forwards only the reviewerId from the body', async () => {
      await controller.assign(ID, { reviewerId: 'reviewer-1' }, USER);
      expect(service.assignReviewer).toHaveBeenCalledWith(ID, 'reviewer-1', USER);
    });
  });
});
