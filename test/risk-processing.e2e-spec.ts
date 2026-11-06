import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ApplicationStatus, AuditAction, ReviewDecision, RiskStatus } from '../src/common/enums';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { MerchantApplication } from '../src/modules/merchant-applications/entities/merchant-application.entity';
import { RiskAssessment } from '../src/modules/risk/entities/risk-assessment.entity';
import { RISK_ASSESS_JOB, RISK_QUEUE, RiskJobData, riskIdempotencyKey } from '../src/modules/risk/risk.constants';
import {
  SimulatedRiskProvider,
  TransientProviderError,
} from '../src/modules/risk/simulated-risk.provider';
import {
  API,
  SEED,
  bearer,
  createApplication,
  createTestApp,
  http,
  login,
  submitAndAwaitRisk,
  waitForApplication,
} from './utils/test-app';

const apps = `${API}/merchant-applications`;

describe('Risk processing (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let provider: SimulatedRiskProvider;
  let queue: Queue<RiskJobData>;
  let admin: string;
  let reviewer: string;
  let sales: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    provider = app.get(SimulatedRiskProvider);
    queue = app.get(getQueueToken(RISK_QUEUE));
    [admin, reviewer, sales] = await Promise.all([
      login(app, SEED.admin.email),
      login(app, SEED.reviewer.email),
      login(app, SEED.sales.email),
    ]);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  const assessmentsFor = (id: string) =>
    dataSource.getRepository(RiskAssessment).find({ where: { application_id: id } });
  const auditFor = (id: string, action: AuditAction) =>
    dataSource.getRepository(AuditLog).find({ where: { application_id: id, action } });

  it('submission triggers an async assessment that moves the application to UNDER_REVIEW', async () => {
    const { id } = await createApplication(app, sales);

    const submitted = await http(app).post(`${apps}/${id}/submit`).set(bearer(sales)).expect(200);
    // The HTTP call returns before the worker finishes.
    expect(submitted.body.application_status).toBe(ApplicationStatus.SUBMITTED);

    const done = await waitForApplication(app, id, (a) => a.risk_status === RiskStatus.COMPLETED);
    expect(done.application_status).toBe(ApplicationStatus.UNDER_REVIEW);

    const [assessment, ...others] = await assessmentsFor(id);
    expect(others).toHaveLength(0);
    expect(assessment).toMatchObject({
      idempotency_key: riskIdempotencyKey(id, done.submitted_at!),
      risk_score: expect.any(Number),
      result: expect.stringMatching(/^(PASS|MANUAL_REVIEW)$/),
      provider_reference: expect.stringMatching(/^SIM-KYB-/),
    });
    expect(assessment.risk_score).toBeGreaterThanOrEqual(0);
    expect(assessment.risk_score).toBeLessThanOrEqual(100);

    const [audit] = await auditFor(id, AuditAction.RISK_ASSESSMENT_COMPLETED);
    expect(audit.actor_id).toBeNull(); // system actor
    expect(audit.metadata).toMatchObject({ score: assessment.risk_score, attempt: 1 });
  });

  it('is idempotent: a redelivered job for the same submission creates no second assessment', async () => {
    const { id } = await createApplication(app, sales);
    const done = await submitAndAwaitRisk(app, id, sales);
    const key = riskIdempotencyKey(id, done.submitted_at!);

    // Simulate an at-least-once redelivery while the application still looks SUBMITTED.
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id }, { application_status: ApplicationStatus.SUBMITTED, risk_status: RiskStatus.PENDING });
    const assess = jest.spyOn(provider, 'assess');
    const job = await queue.add(RISK_ASSESS_JOB, { applicationId: id, idempotencyKey: key }, { jobId: `${key}-redelivery` });

    await waitForJob(queue, job.id!);
    expect((await queue.getJob(job.id!))!.returnvalue).toBe('duplicate');
    expect(assess).not.toHaveBeenCalled(); // provider never called twice for one submission
    expect(await assessmentsFor(id)).toHaveLength(1);
  });

  it('drops a stale job from an earlier submission', async () => {
    const { id } = await createApplication(app, sales);
    await submitAndAwaitRisk(app, id, sales);

    const job = await queue.add(
      RISK_ASSESS_JOB,
      { applicationId: id, idempotencyKey: riskIdempotencyKey(id, new Date(0)) },
      { jobId: `stale-${id}` },
    );

    await waitForJob(queue, job.id!);
    expect((await queue.getJob(job.id!))!.returnvalue).toBe('stale');
    expect(await assessmentsFor(id)).toHaveLength(1);
  });

  it('retries a transient provider failure with backoff and then succeeds', async () => {
    const realAssess = provider.assess.bind(provider);
    jest
      .spyOn(provider, 'assess')
      .mockRejectedValueOnce(new TransientProviderError())
      .mockImplementation(realAssess);
    const { id } = await createApplication(app, sales);

    await submitAndAwaitRisk(app, id, sales);

    const [audit] = await auditFor(id, AuditAction.RISK_ASSESSMENT_COMPLETED);
    expect(audit.metadata.attempt).toBe(2);
    expect(await assessmentsFor(id)).toHaveLength(1);
  });

  it('marks the review FAILED after the last retry; only ADMIN can requeue it', async () => {
    const assess = jest.spyOn(provider, 'assess').mockRejectedValue(new TransientProviderError());
    const { id } = await createApplication(app, sales);
    await http(app).post(`${apps}/${id}/submit`).set(bearer(sales)).expect(200);

    const failed = await waitForApplication(app, id, (a) => a.risk_status === RiskStatus.FAILED);
    expect(failed.application_status).toBe(ApplicationStatus.SUBMITTED);
    expect(assess).toHaveBeenCalledTimes(2); // BULLMQ_RETRY_ATTEMPTS in .env.test
    const [failure] = await auditFor(id, AuditAction.RISK_ASSESSMENT_FAILED);
    expect(failure.metadata).toMatchObject({ attempts: 2, error: 'TransientProviderError' });

    // A reviewer cannot decide on an application whose risk review failed.
    await http(app).post(`${apps}/${id}/assign`).set(bearer(admin)).send({ reviewerId: SEED.reviewer.id }).expect(200);
    await http(app)
      .post(`${apps}/${id}/reviews`)
      .set(bearer(reviewer))
      .send({ decision: ReviewDecision.APPROVE })
      .expect(409);

    // SALES cannot requeue; ADMIN can, once the provider recovers.
    await http(app).post(`${apps}/${id}/risk-review/retry`).set(bearer(sales)).expect(403);
    assess.mockRestore();
    await http(app).post(`${apps}/${id}/risk-review/retry`).set(bearer(admin)).expect(200);

    const recovered = await waitForApplication(app, id, (a) => a.risk_status === RiskStatus.COMPLETED);
    expect(recovered.application_status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(await auditFor(id, AuditAction.RISK_ASSESSMENT_REQUEUED)).toHaveLength(1);

    // Requeue is only for FAILED reviews.
    await http(app).post(`${apps}/${id}/risk-review/retry`).set(bearer(admin)).expect(409);
  });

  it('blocks reviewer decisions while the assessment is still in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const realAssess = provider.assess.bind(provider);
    jest.spyOn(provider, 'assess').mockImplementation(async (req) => {
      await gate;
      return realAssess(req);
    });
    const { id } = await createApplication(app, sales);
    await http(app).post(`${apps}/${id}/submit`).set(bearer(sales)).expect(200);
    await waitForApplication(app, id, (a) => a.risk_status === RiskStatus.PROCESSING);

    await http(app).post(`${apps}/${id}/assign`).set(bearer(admin)).send({ reviewerId: SEED.reviewer.id }).expect(200);
    await http(app)
      .post(`${apps}/${id}/reviews`)
      .set(bearer(reviewer))
      .send({ decision: ReviewDecision.APPROVE })
      .expect(409);

    release();
    await waitForApplication(app, id, (a) => a.application_status === ApplicationStatus.UNDER_REVIEW);
    await http(app)
      .post(`${apps}/${id}/reviews`)
      .set(bearer(reviewer))
      .send({ decision: ReviewDecision.APPROVE })
      .expect(201);
  });
});

async function waitForJob(queue: Queue<RiskJobData>, jobId: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (job && ((await job.isCompleted()) || (await job.isFailed()))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}
