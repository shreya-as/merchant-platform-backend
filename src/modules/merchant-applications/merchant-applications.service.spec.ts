import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApplicationStatus, AuditAction, RiskStatus, RoleType } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { RiskReviewQueue } from '../risk/risk-review.queue';
import { User } from '../users/entities/user.entity';
import { MerchantApplicationsService } from './merchant-applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';
import { CreateMerchantApplicationDto } from './dto/create-merchant-application.dto';

const makeUser = (id: string, role: RoleType): User => ({ id, role: { name: role } }) as User;

const SALES = makeUser('sales-1', RoleType.SALES);
const OTHER_SALES = makeUser('sales-2', RoleType.SALES);
const ADMIN = makeUser('admin-1', RoleType.ADMIN);
const REVIEWER = makeUser('reviewer-1', RoleType.REVIEWER);

const makeApplication = (overrides: Partial<MerchantApplication> = {}): MerchantApplication =>
  ({
    id: 'app-1',
    registration_number: 'REG-1',
    application_status: ApplicationStatus.DRAFT,
    risk_status: RiskStatus.PENDING,
    created_by_id: SALES.id,
    assigned_reviewer_id: null,
    submitted_at: null,
    tax_id: 'US-EIN-987654321',
    owner_email: 'jane@acme.com',
    owner_phone: '+15550100',
    ...overrides,
  }) as MerchantApplication;

const createDto: CreateMerchantApplicationDto = {
  businessName: 'Acme',
  legalName: 'Acme LLC',
  businessTypeId: '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  registrationNumber: '  REG-1  ',
  country: 'us',
  ownerName: 'Jane Doe',
  ownerEmail: 'Jane@Acme.com',
  requestedVolume: 1000,
};

describe('MerchantApplicationsService', () => {
  let service: MerchantApplicationsService;
  let repo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    exists: jest.Mock;
    create: jest.Mock;
    merge: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let userRepo: { findOne: jest.Mock };
  let manager: { getRepository: jest.Mock; update: jest.Mock };
  let audit: { record: jest.Mock };
  let riskQueue: { enqueue: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((data) => ({ ...data })),
      merge: jest.fn((target, source) => Object.assign(target, source)),
      save: jest.fn(async (entity) => ({ id: 'app-1', ...entity })),
      manager: { transaction: jest.fn() },
    };
    userRepo = { findOne: jest.fn() };
    // The transactional manager hands back the same mocked repositories.
    manager = {
      getRepository: jest.fn((entity) => (entity === User ? userRepo : repo)),
      update: jest.fn(),
    };
    repo.manager.transaction.mockImplementation((work: (m: typeof manager) => unknown) => work(manager));
    audit = { record: jest.fn() };
    riskQueue = { enqueue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantApplicationsService,
        { provide: getRepositoryToken(MerchantApplication), useValue: repo },
        { provide: AuditService, useValue: audit },
        { provide: RiskReviewQueue, useValue: riskQueue },
        { provide: ConfigService, useValue: { get: () => ({ defaultLimit: 10, maxLimit: 100 }) } },
      ],
    }).compile();

    service = module.get(MerchantApplicationsService);
  });

  describe('create', () => {
    it('normalises input, defaults currency, records creator and writes an audit entry', async () => {
      repo.findOne.mockResolvedValue(makeApplication());

      await service.create(createDto, SALES);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          registration_number: 'REG-1',
          country: 'US',
          owner_email: 'jane@acme.com',
          currency: 'USD',
          created_by_id: SALES.id,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ action: AuditAction.APPLICATION_CREATED, actorId: SALES.id }),
      );
    });

    it('never takes status, risk or ownership fields from the request', async () => {
      repo.findOne.mockResolvedValue(makeApplication());
      const tampered = {
        ...createDto,
        application_status: ApplicationStatus.APPROVED,
        created_by_id: 'someone-else',
      } as CreateMerchantApplicationDto;

      await service.create(tampered, SALES);

      const created = repo.create.mock.calls[0][0];
      expect(created).not.toHaveProperty('application_status');
      expect(created.created_by_id).toBe(SALES.id);
    });

    it('rejects a second open application for the same business', async () => {
      repo.exists.mockResolvedValue(true);

      await expect(service.create(createDto, SALES)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('maps a unique-index race to 409 and an unknown business type to 400', async () => {
      repo.save.mockRejectedValueOnce({ code: '23505' });
      await expect(service.create(createDto, SALES)).rejects.toBeInstanceOf(ConflictException);

      repo.save.mockRejectedValueOnce({ code: '23503' });
      await expect(service.create(createDto, SALES)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    beforeEach(() => repo.findAndCount.mockResolvedValue([[makeApplication()], 25]));

    it('scopes SALES to their own applications and paginates', async () => {
      const result = await service.findAll(SALES, { page: 3, limit: 10 });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { created_by_id: SALES.id }, skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({ page: 3, limit: 10, total: 25, totalPages: 3 });
    });

    it('lets REVIEWER see all applications, filtered by status, with the default page size', async () => {
      await service.findAll(REVIEWER, { status: ApplicationStatus.SUBMITTED });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { application_status: ApplicationStatus.SUBMITTED },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('masks tax id and owner contact details in list rows', async () => {
      const { data } = await service.findAll(ADMIN, {});

      expect(data[0]).toMatchObject({
        tax_id: '************4321',
        owner_email: 'j***@acme.com',
        owner_phone: '*****0100',
      });
    });
  });

  describe('findOne', () => {
    it("returns 404 (not 403) when SALES asks for someone else's application", async () => {
      repo.findOne.mockResolvedValue(makeApplication({ created_by_id: OTHER_SALES.id }));

      await expect(service.findOne('app-1', SALES)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when the application does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('app-1', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([ADMIN, REVIEWER])('lets $role.name read any application', async (user) => {
      repo.findOne.mockResolvedValue(makeApplication({ created_by_id: OTHER_SALES.id }));

      await expect(service.findOne('app-1', user)).resolves.toMatchObject({ id: 'app-1' });
    });
  });

  describe('update', () => {
    it('locks the row, applies changes and audits only the field names', async () => {
      repo.findOne.mockResolvedValue(makeApplication());

      await service.update('app-1', { ownerEmail: 'NEW@acme.com' }, SALES);

      expect(repo.findOne).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' }, loadEagerRelations: false }),
      );
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ owner_email: 'new@acme.com' }));
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.APPLICATION_UPDATED,
          metadata: { fields: ['owner_email'] },
        }),
      );
    });

    it('lets ADMIN edit an application created by someone else', async () => {
      repo.findOne.mockResolvedValue(makeApplication());

      await expect(service.update('app-1', { businessName: 'X' }, ADMIN)).resolves.toBeDefined();
    });

    it('forbids a non-creator, non-admin from editing', async () => {
      repo.findOne.mockResolvedValue(makeApplication());

      await expect(service.update('app-1', { businessName: 'X' }, REVIEWER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("hides another SALES user's application behind 404", async () => {
      repo.findOne.mockResolvedValue(makeApplication({ created_by_id: OTHER_SALES.id }));

      await expect(service.update('app-1', { businessName: 'X' }, SALES)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
    ])('rejects edits while %s', async (status) => {
      repo.findOne.mockResolvedValue(makeApplication({ application_status: status }));

      await expect(service.update('app-1', { businessName: 'X' }, SALES)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('re-checks the open-application rule only when the registration number changes', async () => {
      repo.findOne.mockResolvedValue(makeApplication());
      await service.update('app-1', { registrationNumber: 'REG-1' }, SALES);
      expect(repo.exists).not.toHaveBeenCalled();

      repo.findOne.mockResolvedValue(makeApplication());
      repo.exists.mockResolvedValue(true);
      await expect(
        service.update('app-1', { registrationNumber: 'REG-2' }, SALES),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('submit', () => {
    it.each([ApplicationStatus.DRAFT, ApplicationStatus.NEEDS_INFO])(
      'moves %s to SUBMITTED, resets risk status, audits and enqueues a risk review',
      async (from) => {
        repo.findOne.mockResolvedValue(
          makeApplication({ application_status: from, risk_status: RiskStatus.COMPLETED }),
        );

        await service.submit('app-1', SALES);

        expect(repo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            application_status: ApplicationStatus.SUBMITTED,
            risk_status: RiskStatus.PENDING,
            submitted_at: expect.any(Date),
          }),
        );
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: AuditAction.APPLICATION_SUBMITTED,
            metadata: { from, to: ApplicationStatus.SUBMITTED },
          }),
        );
        expect(riskQueue.enqueue).toHaveBeenCalledWith('app-1', expect.any(Date), false);
      },
    );

    it('enqueues only after the transaction has committed', async () => {
      repo.findOne.mockResolvedValue(makeApplication());
      const order: string[] = [];
      repo.manager.transaction.mockImplementationOnce(async (work: (m: typeof manager) => unknown) => {
        const result = await work(manager);
        order.push('commit');
        return result;
      });
      riskQueue.enqueue.mockImplementation(async () => order.push('enqueue'));

      await service.submit('app-1', SALES);

      expect(order).toEqual(['commit', 'enqueue']);
    });

    it('cannot submit twice', async () => {
      repo.findOne.mockResolvedValue(makeApplication({ application_status: ApplicationStatus.SUBMITTED }));

      await expect(service.submit('app-1', SALES)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
      expect(riskQueue.enqueue).not.toHaveBeenCalled();
    });

    it('keeps the submission but flags the risk review FAILED when Redis is unavailable', async () => {
      repo.findOne.mockResolvedValue(makeApplication());
      riskQueue.enqueue.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.submit('app-1', SALES)).resolves.toBeDefined();

      expect(manager.update).toHaveBeenCalledWith(
        MerchantApplication,
        { id: 'app-1' },
        { risk_status: RiskStatus.FAILED },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.RISK_ASSESSMENT_FAILED,
          metadata: { reason: 'enqueue_failed' },
        }),
      );
    });
  });

  describe('requeueRiskReview', () => {
    const submittedAt = new Date('2026-11-01T00:00:00Z');

    it('puts a FAILED review back on the queue with a manual-retry job id', async () => {
      repo.findOne.mockResolvedValue(
        makeApplication({
          application_status: ApplicationStatus.SUBMITTED,
          risk_status: RiskStatus.FAILED,
          submitted_at: submittedAt,
        }),
      );

      await service.requeueRiskReview('app-1', ADMIN);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ risk_status: RiskStatus.PENDING }));
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ action: AuditAction.RISK_ASSESSMENT_REQUEUED }),
      );
      expect(riskQueue.enqueue).toHaveBeenCalledWith('app-1', submittedAt, true);
    });

    it.each([
      { application_status: ApplicationStatus.SUBMITTED, risk_status: RiskStatus.PROCESSING },
      { application_status: ApplicationStatus.UNDER_REVIEW, risk_status: RiskStatus.COMPLETED },
      { application_status: ApplicationStatus.DRAFT, risk_status: RiskStatus.FAILED },
    ])('refuses to requeue when %o', async (state) => {
      repo.findOne.mockResolvedValue(makeApplication({ ...state, submitted_at: submittedAt }));

      await expect(service.requeueRiskReview('app-1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(riskQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('assignReviewer', () => {
    const reviewerUser = { id: 'reviewer-1', role: { name: RoleType.REVIEWER } };

    it('assigns a REVIEWER to a SUBMITTED application and audits the change', async () => {
      repo.findOne.mockResolvedValue(makeApplication({ application_status: ApplicationStatus.SUBMITTED }));
      userRepo.findOne.mockResolvedValue(reviewerUser);

      await service.assignReviewer('app-1', 'reviewer-1', ADMIN);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_reviewer_id: 'reviewer-1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.APPLICATION_ASSIGNED,
          metadata: { previousReviewerId: null, reviewerId: 'reviewer-1' },
        }),
      );
    });

    it.each([
      { id: 'sales-1', role: { name: RoleType.SALES } },
      { id: 'admin-1', role: { name: RoleType.ADMIN } },
      null,
    ])('rejects an assignee that is not a REVIEWER (%o)', async (candidate) => {
      repo.findOne.mockResolvedValue(makeApplication({ application_status: ApplicationStatus.SUBMITTED }));
      userRepo.findOne.mockResolvedValue(candidate);

      await expect(service.assignReviewer('app-1', 'x', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([ApplicationStatus.DRAFT, ApplicationStatus.APPROVED, ApplicationStatus.REJECTED])(
      'cannot assign while %s',
      async (status) => {
        repo.findOne.mockResolvedValue(makeApplication({ application_status: status }));

        await expect(service.assignReviewer('app-1', 'reviewer-1', ADMIN)).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it('is a no-op (no audit) when the same reviewer is assigned again', async () => {
      repo.findOne.mockResolvedValue(
        makeApplication({
          application_status: ApplicationStatus.UNDER_REVIEW,
          assigned_reviewer_id: 'reviewer-1',
        }),
      );
      userRepo.findOne.mockResolvedValue(reviewerUser);

      await service.assignReviewer('app-1', 'reviewer-1', ADMIN);

      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
