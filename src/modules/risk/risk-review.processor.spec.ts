import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { ApplicationStatus, AuditAction, RiskResult, RiskStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { MerchantApplication } from '../merchant-applications/entities/merchant-application.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { RiskJobData, riskIdempotencyKey } from './risk.constants';
import { RiskReviewProcessor } from './risk-review.processor';
import { SimulatedRiskProvider } from './simulated-risk.provider';

const SUBMITTED_AT = new Date('2026-11-06T10:00:00Z');
const KEY = riskIdempotencyKey('app-1', SUBMITTED_AT);

const makeApplication = (overrides: Partial<MerchantApplication> = {}) =>
  ({
    id: 'app-1',
    application_status: ApplicationStatus.SUBMITTED,
    risk_status: RiskStatus.PENDING,
    submitted_at: SUBMITTED_AT,
    country: 'US',
    business_type_id: 'type-1',
    requested_volume: 1000,
    ...overrides,
  }) as MerchantApplication;

const makeJob = (overrides: Partial<Job<RiskJobData>> = {}) =>
  ({
    id: KEY,
    data: { applicationId: 'app-1', idempotencyKey: KEY },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  }) as Job<RiskJobData>;

describe('RiskReviewProcessor', () => {
  let processor: RiskReviewProcessor;
  let assessments: { exists: jest.Mock };
  let applications: { findOne: jest.Mock; update: jest.Mock };
  let manager: { findOne: jest.Mock; exists: jest.Mock; insert: jest.Mock; save: jest.Mock; update: jest.Mock };
  let provider: { assess: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    assessments = { exists: jest.fn().mockResolvedValue(false) };
    applications = { findOne: jest.fn().mockResolvedValue(makeApplication()), update: jest.fn() };
    manager = {
      findOne: jest.fn().mockResolvedValue(makeApplication()),
      exists: jest.fn().mockResolvedValue(false),
      insert: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    provider = {
      assess: jest.fn().mockResolvedValue({
        score: 80,
        result: RiskResult.PASS,
        providerReference: 'SIM-KYB-1',
        summary: { checks: ['sanctions'], flagged: [] },
      }),
    };
    audit = { record: jest.fn() };
    const dataSource = {
      getRepository: jest.fn((entity) => (entity === RiskAssessment ? assessments : applications)),
      transaction: jest.fn((work) => work(manager)),
    };

    const module = await Test.createTestingModule({
      providers: [
        RiskReviewProcessor,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: SimulatedRiskProvider, useValue: provider },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    processor = module.get(RiskReviewProcessor);
  });

  it('persists the assessment, moves the application to UNDER_REVIEW and audits', async () => {
    await expect(processor.process(makeJob())).resolves.toBe('completed');

    expect(applications.update).toHaveBeenCalledWith(
      { id: 'app-1', application_status: ApplicationStatus.SUBMITTED },
      { risk_status: RiskStatus.PROCESSING },
    );
    expect(manager.insert).toHaveBeenCalledWith(
      RiskAssessment,
      expect.objectContaining({ idempotency_key: KEY, risk_score: 80, result: RiskResult.PASS }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        application_status: ApplicationStatus.UNDER_REVIEW,
        risk_status: RiskStatus.COMPLETED,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: AuditAction.RISK_ASSESSMENT_COMPLETED, actorId: null }),
    );
  });

  it('skips the provider entirely when this submission was already assessed', async () => {
    assessments.exists.mockResolvedValue(true);

    await expect(processor.process(makeJob())).resolves.toBe('duplicate');
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it('does not write twice if another worker finished first (checked under the row lock)', async () => {
    manager.exists.mockResolvedValue(true);

    await expect(processor.process(makeJob())).resolves.toBe('duplicate');
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('treats a unique-key violation on insert as a duplicate, not a failure', async () => {
    manager.insert.mockRejectedValue({ code: '23505' });

    await expect(processor.process(makeJob())).resolves.toBe('duplicate');
  });

  it('drops a job for an outdated submission (application resubmitted since)', async () => {
    applications.findOne.mockResolvedValue(makeApplication({ submitted_at: new Date() }));

    await expect(processor.process(makeJob())).resolves.toBe('stale');
    expect(provider.assess).not.toHaveBeenCalled();
  });

  it('drops a job when the application is no longer SUBMITTED', async () => {
    applications.findOne.mockResolvedValue(
      makeApplication({ application_status: ApplicationStatus.UNDER_REVIEW }),
    );

    await expect(processor.process(makeJob())).resolves.toBe('stale');
  });

  it('lets provider errors propagate so BullMQ retries with backoff', async () => {
    provider.assess.mockRejectedValue(new Error('timeout'));

    await expect(processor.process(makeJob())).rejects.toThrow('timeout');
    expect(manager.insert).not.toHaveBeenCalled();
  });

  describe('onFailed', () => {
    it('does nothing while attempts remain', async () => {
      await processor.onFailed(makeJob({ attemptsMade: 1 }), new Error('x'));

      expect(manager.update).not.toHaveBeenCalled();
    });

    it('marks risk FAILED and audits once the last attempt fails', async () => {
      await processor.onFailed(makeJob({ attemptsMade: 3 }), new Error('timeout'));

      expect(manager.update).toHaveBeenCalledWith(
        MerchantApplication,
        { id: 'app-1', application_status: ApplicationStatus.SUBMITTED },
        { risk_status: RiskStatus.FAILED },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.RISK_ASSESSMENT_FAILED,
          metadata: { attempts: 3, error: 'Error' },
        }),
      );
    });
  });
});
