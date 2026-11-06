import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ReviewDecision, RoleType } from '../../common/enums';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../users/entities/user.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  const service = { decide: jest.fn().mockResolvedValue({ id: 'review-1' }) };
  let controller: ReviewsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: service }],
    }).compile();
    controller = module.get(ReviewsController);
  });

  it('only lets authenticated REVIEWER users decide', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReviewsController);
    expect(guards).toHaveLength(2);
    expect(guards).toContain(RolesGuard);
    expect(new Reflector().get(ROLES_KEY, ReviewsController.prototype.decide)).toEqual([
      RoleType.REVIEWER,
    ]);
  });

  it('delegates to the service with the current user', async () => {
    const user = { id: 'reviewer-1' } as User;
    const dto = { decision: ReviewDecision.APPROVE };

    await expect(controller.decide('app-1', dto, user)).resolves.toEqual({ id: 'review-1' });
    expect(service.decide).toHaveBeenCalledWith('app-1', dto, user);
  });
});
