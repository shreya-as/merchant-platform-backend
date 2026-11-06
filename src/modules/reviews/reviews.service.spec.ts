import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  ApplicationStatus,
  AuditAction,
  ReviewDecision,
  RiskStatus,
  RoleType,
} from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { MerchantApplication } from '../merchant-applications/entities/merchant-application.entity';
import { User } from '../users/entities/user.entity';
import { ApplicationReview } from './entities/application-review.entity';
import { ReviewsService } from './reviews.service';

const REVIEWER = { id: 'reviewer-1', role: { name: RoleType.REVIEWER } } as User;
const OTHER_REVIEWER = { id: 'reviewer-2', role: { name: RoleType.REVIEWER } } as User;
const DECIDED_AT = new Date('2026-11-05T12:00:00Z');

const makeApplication = (overrides: Partial<MerchantApplication> = {}) =>
  ({
    id: 'app-1',
    application_status: ApplicationStatus.UNDER_REVIEW,
    risk_status: RiskStatus.COMPLETED,
    assigned_reviewer_id: REVIEWER.id,
    decided_at: null,
    ...overrides,
  }) as MerchantApplication;

describe('ReviewsService', () => {
  let service: ReviewsService;
  let manager: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn(async (entity) =>
        'decision' in entity ? { id: 'review-1', decided_at: DECIDED_AT, ...entity } : entity,
      ),
    };
    audit = { record: jest.fn() };
    const dataSource = { transaction: jest.fn((work) => work(manager)) };

    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it.each([
    [ReviewDecision.APPROVE, ApplicationStatus.APPROVED, DECIDED_AT],
    [ReviewDecision.REJECT, ApplicationStatus.REJECTED, DECIDED_AT],
    [ReviewDecision.REQUEST_INFO, ApplicationStatus.NEEDS_INFO, null],
  ])('%s moves the application to %s', async (decision, status, decidedAt) => {
    const application = makeApplication();
    manager.findOne.mockResolvedValue(application);

    const review = await service.decide('app-1', { decision, remarks: 'because' }, REVIEWER);

    expect(manager.findOne).toHaveBeenCalledWith(
      MerchantApplication,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(manager.create).toHaveBeenCalledWith(ApplicationReview, {
      application_id: 'app-1',
      reviewer_id: REVIEWER.id,
      decision,
      remarks: 'because',
    });
    expect(application.application_status).toBe(status);
    expect(application.decided_at).toEqual(decidedAt);
    expect(review).toMatchObject({ id: 'review-1', decision });
  });

  it('audits the decision without copying free-text remarks', async () => {
    manager.findOne.mockResolvedValue(makeApplication());

    await service.decide(
      'app-1',
      { decision: ReviewDecision.REJECT, remarks: 'Owner Jane Doe, SSN 123' },
      REVIEWER,
    );

    const entry = audit.record.mock.calls[0][1];
    expect(entry).toMatchObject({
      action: AuditAction.APPLICATION_REVIEWED,
      actorId: REVIEWER.id,
      metadata: {
        reviewId: 'review-1',
        decision: ReviewDecision.REJECT,
        from: ApplicationStatus.UNDER_REVIEW,
        to: ApplicationStatus.REJECTED,
        hasRemarks: true,
      },
    });
    expect(JSON.stringify(entry)).not.toContain('Jane');
  });

  it('returns 404 for an unknown application', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(
      service.decide('app-1', { decision: ReviewDecision.APPROVE }, REVIEWER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['a different reviewer is assigned', makeApplication({ assigned_reviewer_id: OTHER_REVIEWER.id })],
    ['no reviewer is assigned', makeApplication({ assigned_reviewer_id: null })],
  ])('forbids the decision when %s', async (_label, application) => {
    manager.findOne.mockResolvedValue(application);

    await expect(
      service.decide('app-1', { decision: ReviewDecision.APPROVE }, REVIEWER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([RiskStatus.PENDING, RiskStatus.PROCESSING, RiskStatus.FAILED])(
    'refuses to decide while the risk review is %s',
    async (riskStatus) => {
      manager.findOne.mockResolvedValue(makeApplication({ risk_status: riskStatus }));

      await expect(
        service.decide('app-1', { decision: ReviewDecision.APPROVE }, REVIEWER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it.each([ApplicationStatus.APPROVED, ApplicationStatus.REJECTED, ApplicationStatus.NEEDS_INFO])(
    'cannot decide twice: application already %s',
    async (status) => {
      manager.findOne.mockResolvedValue(makeApplication({ application_status: status }));

      await expect(
        service.decide('app-1', { decision: ReviewDecision.APPROVE }, REVIEWER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );
});
