import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  ApplicationStatus,
  AuditAction,
  ReviewDecision,
  RiskStatus,
} from '../src/common/enums';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import {
  API,
  SEED,
  bearer,
  createApplication,
  createTestApp,
  http,
  login,
  submitAndAwaitRisk,
} from './utils/test-app';

const apps = `${API}/merchant-applications`;

describe('Application lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  let reviewer: string;
  let sales: string;

  beforeAll(async () => {
    app = await createTestApp();
    [admin, reviewer, sales] = await Promise.all([
      login(app, SEED.admin.email),
      login(app, SEED.reviewer.email),
      login(app, SEED.sales.email),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const assign = (id: string) =>
    http(app).post(`${apps}/${id}/assign`).set(bearer(admin)).send({ reviewerId: SEED.reviewer.id });
  const review = (id: string, body: object, token = reviewer) =>
    http(app).post(`${apps}/${id}/reviews`).set(bearer(token)).send(body);

  it('DRAFT -> SUBMITTED -> UNDER_REVIEW -> NEEDS_INFO -> SUBMITTED -> UNDER_REVIEW -> APPROVED', async () => {
    // 1. SALES creates a draft.
    const created = await createApplication(app, sales, { country: 'us', ownerEmail: 'Pat@Example.com' });
    expect(created).toMatchObject({
      application_status: ApplicationStatus.DRAFT,
      risk_status: RiskStatus.PENDING,
      created_by_id: SEED.sales.id,
      country: 'US',
      owner_email: 'pat@example.com',
      currency: 'USD',
    });
    const id = created.id;

    // 2. Editable while DRAFT.
    await http(app).patch(`${apps}/${id}`).set(bearer(sales)).send({ requestedVolume: 7500 }).expect(200);

    // 3. Submit -> the risk worker moves it to UNDER_REVIEW asynchronously.
    const afterRisk = await submitAndAwaitRisk(app, id, sales);
    expect(afterRisk.risk_status).toBe(RiskStatus.COMPLETED);
    expect(afterRisk.submitted_at).toBeInstanceOf(Date);

    // 4. Locked for editing once submitted.
    await http(app).patch(`${apps}/${id}`).set(bearer(sales)).send({ businessName: 'X' }).expect(409);

    // 5. ADMIN assigns the reviewer, who asks for more information.
    await assign(id).expect(200);
    await review(id, { decision: ReviewDecision.REQUEST_INFO, remarks: 'Upload proof of address' }).expect(201);

    let detail = await http(app).get(`${apps}/${id}`).set(bearer(sales)).expect(200);
    expect(detail.body.application_status).toBe(ApplicationStatus.NEEDS_INFO);
    expect(detail.body.decided_at).toBeNull();

    // 6. SALES fixes it and resubmits: a fresh risk review runs for the new submission.
    await http(app).patch(`${apps}/${id}`).set(bearer(sales)).send({ ownerPhone: '+15550999' }).expect(200);
    await submitAndAwaitRisk(app, id, sales);

    // 7. The reviewer approves.
    const approved = await review(id, { decision: ReviewDecision.APPROVE }).expect(201);
    expect(approved.body).toMatchObject({ decision: ReviewDecision.APPROVE, reviewer_id: SEED.reviewer.id });

    detail = await http(app).get(`${apps}/${id}`).set(bearer(sales)).expect(200);
    expect(detail.body.application_status).toBe(ApplicationStatus.APPROVED);
    expect(detail.body.decided_at).toEqual(expect.any(String));
    expect(detail.body.risk_assessments).toHaveLength(2); // one per submission
    expect(detail.body.reviews.map((r: { decision: string }) => r.decision)).toEqual([
      ReviewDecision.APPROVE,
      ReviewDecision.REQUEST_INFO,
    ]);

    // 8. Every step is in the audit trail, in order.
    const trail = await app
      .get(DataSource)
      .getRepository(AuditLog)
      .find({ where: { application_id: id }, order: { created_at: 'ASC' } });
    expect(trail.map((e) => e.action)).toEqual([
      AuditAction.APPLICATION_CREATED,
      AuditAction.APPLICATION_UPDATED,
      AuditAction.APPLICATION_SUBMITTED,
      AuditAction.RISK_ASSESSMENT_COMPLETED,
      AuditAction.APPLICATION_ASSIGNED,
      AuditAction.APPLICATION_REVIEWED,
      AuditAction.APPLICATION_UPDATED,
      AuditAction.APPLICATION_SUBMITTED,
      AuditAction.RISK_ASSESSMENT_COMPLETED,
      AuditAction.APPLICATION_REVIEWED,
    ]);
    // Audit metadata never stores PII values.
    expect(JSON.stringify(trail)).not.toContain('+15550999');
  });

  it('a REJECTED application is terminal and frees the business for a new application', async () => {
    const first = await createApplication(app, sales);
    await submitAndAwaitRisk(app, first.id, sales);
    await assign(first.id).expect(200);

    // Remarks are mandatory for a rejection.
    await review(first.id, { decision: ReviewDecision.REJECT }).expect(400);
    await review(first.id, { decision: ReviewDecision.REJECT, remarks: 'Sanctions hit' }).expect(201);

    // Terminal: no further decisions, edits, submissions or reassignment.
    await review(first.id, { decision: ReviewDecision.APPROVE }).expect(409);
    await http(app).patch(`${apps}/${first.id}`).set(bearer(sales)).send({ businessName: 'X' }).expect(409);
    await http(app).post(`${apps}/${first.id}/submit`).set(bearer(sales)).expect(409);
    await assign(first.id).expect(409);

    // Closed, so the same registration number may apply again.
    await createApplication(app, sales, { registrationNumber: first.registration_number });
  });

  describe('invalid transitions are rejected', () => {
    it('cannot submit twice', async () => {
      const { id } = await createApplication(app, sales);
      await submitAndAwaitRisk(app, id, sales);

      await http(app).post(`${apps}/${id}/submit`).set(bearer(sales)).expect(409);
    });

    it('cannot assign a reviewer to a DRAFT', async () => {
      const { id } = await createApplication(app, sales);

      await assign(id).expect(409);
    });

    it('cannot review a DRAFT, even when the caller is a REVIEWER', async () => {
      const { id } = await createApplication(app, sales);

      // Not assigned (nobody can be assigned to a DRAFT) -> 403 before any state change.
      await review(id, { decision: ReviewDecision.APPROVE }).expect(403);
    });

    it('only one open application per business', async () => {
      const { registration_number } = await createApplication(app, sales);

      await http(app)
        .post(apps)
        .set(bearer(admin))
        .send({
          businessName: 'Dup',
          legalName: 'Dup LLC',
          businessTypeId: SEED.businessTypeId,
          registrationNumber: registration_number,
          country: 'US',
          ownerName: 'Someone',
          ownerEmail: 'dup@example.com',
          requestedVolume: 10,
        })
        .expect(409);
    });

    it('rejects a decision value outside the enum', async () => {
      const { id } = await createApplication(app, sales);
      await review(id, { decision: 'ESCALATE', remarks: 'x' }).expect(400);
    });
  });

  describe('listing', () => {
    it('paginates and masks PII in list rows', async () => {
      await createApplication(app, sales);
      await createApplication(app, sales);

      const res = await http(app).get(`${apps}?page=1&limit=1`).set(bearer(admin)).expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 1 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].owner_email).toMatch(/^.\*\*\*@/);
      expect(res.body.data[0].tax_id).toMatch(/^\*+\d{4}$/);
    });

    it('filters by status and validates query params', async () => {
      const res = await http(app)
        .get(`${apps}?status=${ApplicationStatus.DRAFT}`)
        .set(bearer(admin))
        .expect(200);
      expect(res.body.data.every((a: { application_status: string }) => a.application_status === 'DRAFT')).toBe(
        true,
      );

      await http(app).get(`${apps}?limit=1000`).set(bearer(admin)).expect(400);
      await http(app).get(`${apps}?status=NOPE`).set(bearer(admin)).expect(400);
    });
  });
});
