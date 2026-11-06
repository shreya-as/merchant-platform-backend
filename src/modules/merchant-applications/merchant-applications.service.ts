import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import {
  ApplicationStatus,
  AuditAction,
  EDITABLE_APPLICATION_STATUSES,
  OPEN_APPLICATION_STATUSES,
  RiskStatus,
  RoleType,
} from '../../common/enums';
import { maskEmail, maskTail } from '../../common/security/redact';
import { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { RiskReviewQueue } from '../risk/risk-review.queue';
import { User } from '../users/entities/user.entity';
import { ASSIGNABLE_STATUSES, assertTransition } from './application-state-machine';
import { MerchantApplication } from './entities/merchant-application.entity';
import { CreateMerchantApplicationDto } from './dto/create-merchant-application.dto';
import { UpdateMerchantApplicationDto } from './dto/update-merchant-application.dto';
import {
  ListMerchantApplicationsDto,
  MAX_PAGE_LIMIT,
  Paginated,
} from './dto/list-merchant-applications.dto';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const OPEN_APPLICATION_EXISTS = 'This business already has an application in progress';

@Injectable()
export class MerchantApplicationsService {
  private readonly logger = new Logger(MerchantApplicationsService.name);
  private readonly defaultLimit: number;

  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applicationRepository: Repository<MerchantApplication>,
    private readonly auditService: AuditService,
    private readonly riskQueue: RiskReviewQueue,
    configService: ConfigService<AppConfig, true>,
  ) {
    const { defaultLimit } = configService.get('pagination', { infer: true });
    this.defaultLimit = Math.min(defaultLimit, MAX_PAGE_LIMIT);
  }

  async create(dto: CreateMerchantApplicationDto, user: User): Promise<MerchantApplication> {
    const columns = this.toColumns(dto);

    const id = await this.applicationRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MerchantApplication);
      await this.assertNoOpenApplication(repo, columns.registration_number!);

      const saved = await this.save(
        repo,
        repo.create({ ...columns, currency: columns.currency ?? 'USD', created_by_id: user.id }),
      );
      await this.auditService.record(manager, {
        action: AuditAction.APPLICATION_CREATED,
        applicationId: saved.id,
        actorId: user.id,
        metadata: { registrationNumber: saved.registration_number },
      });
      return saved.id;
    });

    return this.findOne(id, user);
  }

  // SALES users see only the applications they created; ADMIN and REVIEWER see all.
  // List rows mask tax ID and owner contact details; the detail endpoint returns them in full.
  async findAll(user: User, query: ListMerchantApplicationsDto): Promise<Paginated<MerchantApplication>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? this.defaultLimit;

    const where: FindOptionsWhere<MerchantApplication> = {};
    if (this.isSales(user)) where.created_by_id = user.id;
    if (query.status) where.application_status = query.status;

    const [data, total] = await this.applicationRepository.findAndCount({
      where,
      // id as tie-breaker keeps page boundaries stable when created_at collides.
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((application) => this.maskForList(application)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: User): Promise<MerchantApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: { risk_assessments: true, reviews: true },
      order: { risk_assessments: { processed_at: 'DESC' }, reviews: { decided_at: 'DESC' } },
    });
    this.assertVisible(application, id, user);
    return application;
  }

  async update(id: string, dto: UpdateMerchantApplicationDto, user: User): Promise<MerchantApplication> {
    const columns = this.toColumns(dto);

    await this.applicationRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MerchantApplication);
      const application = await this.lockEditable(repo, id, user);

      if (columns.registration_number && columns.registration_number !== application.registration_number) {
        await this.assertNoOpenApplication(repo, columns.registration_number, id);
      }

      repo.merge(application, columns);
      await this.save(repo, application);
      // Field names only: the values contain owner PII.
      await this.auditService.record(manager, {
        action: AuditAction.APPLICATION_UPDATED,
        applicationId: id,
        actorId: user.id,
        metadata: { fields: Object.keys(columns) },
      });
    });

    return this.findOne(id, user);
  }

  // DRAFT / NEEDS_INFO -> SUBMITTED, then hands the application to the async risk review.
  async submit(id: string, user: User): Promise<MerchantApplication> {
    const submittedAt = await this.applicationRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MerchantApplication);
      const application = await this.lockEditable(repo, id, user);
      const from = application.application_status;
      assertTransition(from, ApplicationStatus.SUBMITTED);

      application.application_status = ApplicationStatus.SUBMITTED;
      application.risk_status = RiskStatus.PENDING; // a resubmission gets a fresh review
      application.submitted_at = new Date();
      await repo.save(application);
      await this.auditService.record(manager, {
        action: AuditAction.APPLICATION_SUBMITTED,
        applicationId: id,
        actorId: user.id,
        metadata: { from, to: ApplicationStatus.SUBMITTED },
      });
      return application.submitted_at;
    });

    // Enqueued only after commit, so the worker never sees an uncommitted submission.
    await this.enqueueRiskReview(id, submittedAt, user.id);
    return this.findOne(id, user);
  }

  // ADMIN: puts a SUBMITTED application whose risk review failed (retries exhausted, or Redis was
  // down at submit time) back on the queue. The idempotency key stays the same.
  async requeueRiskReview(id: string, user: User): Promise<MerchantApplication> {
    const submittedAt = await this.applicationRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MerchantApplication);
      const application = await this.lockForUpdate(repo, id, user);
      if (
        application.application_status !== ApplicationStatus.SUBMITTED ||
        application.risk_status !== RiskStatus.FAILED ||
        !application.submitted_at
      ) {
        throw new ConflictException(
          'Only a SUBMITTED application with a FAILED risk review can be requeued',
        );
      }

      application.risk_status = RiskStatus.PENDING;
      await repo.save(application);
      await this.auditService.record(manager, {
        action: AuditAction.RISK_ASSESSMENT_REQUEUED,
        applicationId: id,
        actorId: user.id,
      });
      return application.submitted_at;
    });

    await this.enqueueRiskReview(id, submittedAt, user.id, true);
    return this.findOne(id, user);
  }

  // ADMIN: (re)assigns a REVIEWER. Allowed after submission and before a final decision.
  async assignReviewer(id: string, reviewerId: string, user: User): Promise<MerchantApplication> {
    await this.applicationRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(MerchantApplication);
      const application = await this.lockForUpdate(repo, id, user);

      if (!ASSIGNABLE_STATUSES.includes(application.application_status)) {
        throw new ConflictException(
          `Application cannot be assigned in status ${application.application_status}`,
        );
      }

      const reviewer = await manager.getRepository(User).findOne({ where: { id: reviewerId } });
      if (!reviewer || reviewer.role?.name !== RoleType.REVIEWER) {
        throw new BadRequestException('reviewerId must belong to a user with the REVIEWER role');
      }

      const previousReviewerId = application.assigned_reviewer_id;
      if (previousReviewerId === reviewerId) return;

      application.assigned_reviewer_id = reviewerId;
      await repo.save(application);
      await this.auditService.record(manager, {
        action: AuditAction.APPLICATION_ASSIGNED,
        applicationId: id,
        actorId: user.id,
        metadata: { previousReviewerId, reviewerId },
      });
    });

    return this.findOne(id, user);
  }

  private async enqueueRiskReview(
    id: string,
    submittedAt: Date,
    actorId: string,
    manualRetry = false,
  ): Promise<void> {
    try {
      await this.riskQueue.enqueue(id, submittedAt, manualRetry);
    } catch (err) {
      // The submission is committed; don't fail the request. Flag it so an ADMIN can requeue.
      this.logger.error(`Could not enqueue risk review for application ${id}: ${(err as Error).message}`);
      await this.applicationRepository.manager.transaction(async (manager) => {
        await manager.update(MerchantApplication, { id }, { risk_status: RiskStatus.FAILED });
        await this.auditService.record(manager, {
          action: AuditAction.RISK_ASSESSMENT_FAILED,
          applicationId: id,
          actorId,
          metadata: { reason: 'enqueue_failed' },
        });
      });
    }
  }

  // SELECT ... FOR UPDATE, so concurrent writers are serialised. Skips the eager business_type
  // LEFT JOIN: Postgres rejects FOR UPDATE on the nullable side of an outer join.
  private async lockForUpdate(
    repo: Repository<MerchantApplication>,
    id: string,
    user: User,
  ): Promise<MerchantApplication> {
    const application = await repo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    this.assertVisible(application, id, user);
    return application;
  }

  // Only the creator (or an ADMIN) may edit, and only while the application is DRAFT or NEEDS_INFO.
  private async lockEditable(
    repo: Repository<MerchantApplication>,
    id: string,
    user: User,
  ): Promise<MerchantApplication> {
    const application = await this.lockForUpdate(repo, id, user);

    if (!this.isAdmin(user) && application.created_by_id !== user.id) {
      throw new ForbiddenException('Only the creator can modify this application');
    }
    if (!(EDITABLE_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(application.application_status)) {
      throw new ConflictException(
        `Application cannot be modified in status ${application.application_status}`,
      );
    }
    return application;
  }

  // Same 404 for "missing" and "not yours" so SALES cannot probe other users' IDs.
  private assertVisible(
    application: MerchantApplication | null,
    id: string,
    user: User,
  ): asserts application is MerchantApplication {
    if (!application || (this.isSales(user) && application.created_by_id !== user.id)) {
      throw new NotFoundException(`Application ${id} not found`);
    }
  }

  // Friendly check; the partial unique index is the real guarantee under concurrency.
  private async assertNoOpenApplication(
    repo: Repository<MerchantApplication>,
    registrationNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const exists = await repo.exists({
      where: {
        registration_number: registrationNumber,
        application_status: In([...OPEN_APPLICATION_STATUSES]),
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (exists) {
      throw new ConflictException(OPEN_APPLICATION_EXISTS);
    }
  }

  private async save(
    repo: Repository<MerchantApplication>,
    application: MerchantApplication,
  ): Promise<MerchantApplication> {
    try {
      return await repo.save(application);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === PG_UNIQUE_VIOLATION) throw new ConflictException(OPEN_APPLICATION_EXISTS);
      if (code === PG_FOREIGN_KEY_VIOLATION) throw new BadRequestException('Unknown businessTypeId');
      throw err;
    }
  }

  // Maps camelCase DTO fields to snake_case columns, skipping fields that were not sent.
  private toColumns(dto: UpdateMerchantApplicationDto): Partial<MerchantApplication> {
    const columns: Partial<MerchantApplication> = {
      business_name: dto.businessName,
      legal_name: dto.legalName,
      business_type_id: dto.businessTypeId,
      registration_number: dto.registrationNumber?.trim(),
      tax_id: dto.taxId,
      country: dto.country?.toUpperCase(),
      owner_name: dto.ownerName,
      owner_email: dto.ownerEmail?.toLowerCase(),
      owner_phone: dto.ownerPhone,
      requested_volume: dto.requestedVolume,
      currency: dto.currency?.toUpperCase(),
    };
    return Object.fromEntries(
      Object.entries(columns).filter(([, value]) => value !== undefined),
    ) as Partial<MerchantApplication>;
  }

  private maskForList(application: MerchantApplication): MerchantApplication {
    return {
      ...application,
      tax_id: application.tax_id && maskTail(application.tax_id),
      owner_email: maskEmail(application.owner_email),
      owner_phone: application.owner_phone && maskTail(application.owner_phone),
    };
  }

  private isSales(user: User): boolean {
    return user.role?.name === RoleType.SALES;
  }

  private isAdmin(user: User): boolean {
    return user.role?.name === RoleType.ADMIN;
  }
}
