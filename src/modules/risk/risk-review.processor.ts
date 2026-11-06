import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { ApplicationStatus, AuditAction, RiskStatus } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { MerchantApplication } from '../merchant-applications/entities/merchant-application.entity';
import { assertTransition } from '../merchant-applications/application-state-machine';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { RISK_QUEUE, RiskJobData, riskIdempotencyKey } from './risk.constants';
import { SimulatedRiskProvider } from './simulated-risk.provider';

const PG_UNIQUE_VIOLATION = '23505';

export type RiskJobOutcome = 'completed' | 'duplicate' | 'stale';

@Processor(RISK_QUEUE)
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly provider: SimulatedRiskProvider,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<RiskJobData>): Promise<RiskJobOutcome> {
    const { applicationId, idempotencyKey } = job.data;
    const applications = this.dataSource.getRepository(MerchantApplication);

    if (await this.dataSource.getRepository(RiskAssessment).exists({ where: { idempotency_key: idempotencyKey } })) {
      return 'duplicate';
    }

    const application = await applications.findOne({ where: { id: applicationId }, loadEagerRelations: false });
    if (!application || !this.isCurrentSubmission(application, idempotencyKey)) {
      return 'stale';
    }

    await applications.update(
      { id: applicationId, application_status: ApplicationStatus.SUBMITTED },
      { risk_status: RiskStatus.PROCESSING },
    );

    // A throw here lets BullMQ retry with exponential backoff.
    const response = await this.provider.assess({
      idempotencyKey,
      country: application.country,
      businessTypeId: application.business_type_id,
      requestedVolume: application.requested_volume,
    });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const locked = await manager.findOne(MerchantApplication, {
          where: { id: applicationId },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!locked || !this.isCurrentSubmission(locked, idempotencyKey)) return 'stale';
        if (await manager.exists(RiskAssessment, { where: { idempotency_key: idempotencyKey } })) {
          return 'duplicate';
        }

        await manager.insert(RiskAssessment, {
          application_id: applicationId,
          idempotency_key: idempotencyKey,
          risk_score: response.score,
          result: response.result,
          provider_reference: response.providerReference,
          response_summary: response.summary,
        });

        assertTransition(locked.application_status, ApplicationStatus.UNDER_REVIEW);
        locked.application_status = ApplicationStatus.UNDER_REVIEW;
        locked.risk_status = RiskStatus.COMPLETED;
        await manager.save(locked);

        await this.audit.record(manager, {
          action: AuditAction.RISK_ASSESSMENT_COMPLETED,
          applicationId,
          actorId: null,
          metadata: {
            score: response.score,
            result: response.result,
            providerReference: response.providerReference,
            attempt: job.attemptsMade + 1,
          },
        });
        return 'completed';
      });
    } catch (err) {
      // Another worker committed the same key between our check and insert.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) return 'duplicate';
      throw err;
    }
  }

  // Fires after every failed attempt; only the last one marks the application FAILED so an
  // ADMIN can see it and requeue it.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    // Log ids and the error class/message only; never the job payload or application data.
    this.logger.warn(
      `Risk job ${job.id} for application ${job.data.applicationId} failed ` +
        `(attempt ${job.attemptsMade}/${attempts}): ${error.name}: ${error.message}`,
    );
    if (job.attemptsMade < attempts) return;

    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        MerchantApplication,
        { id: job.data.applicationId, application_status: ApplicationStatus.SUBMITTED },
        { risk_status: RiskStatus.FAILED },
      );
      if (!result.affected) return;
      await this.audit.record(manager, {
        action: AuditAction.RISK_ASSESSMENT_FAILED,
        applicationId: job.data.applicationId,
        actorId: null,
        metadata: { attempts: job.attemptsMade, error: error.name },
      });
    });
  }

  private isCurrentSubmission(application: MerchantApplication, key: string): boolean {
    return (
      application.application_status === ApplicationStatus.SUBMITTED &&
      application.submitted_at !== null &&
      riskIdempotencyKey(application.id, application.submitted_at) === key
    );
  }
}
