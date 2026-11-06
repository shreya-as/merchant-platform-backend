import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ApplicationStatus, ReviewDecision, RoleType } from '../src/common/enums';
import { MerchantApplication } from '../src/modules/merchant-applications/entities/merchant-application.entity';
import { User } from '../src/modules/users/entities/user.entity';
import {
  API,
  SEED,
  applicationPayload,
  bearer,
  createApplication,
  createStaff,
  createTestApp,
  getApplication,
  http,
  login,
  submitAndAwaitRisk,
} from './utils/test-app';

const apps = `${API}/merchant-applications`;
const TEST_SECRET = process.env.JWT_SECRET!;
const SOME_ID = randomUUID();

describe('Authorization cannot be bypassed (e2e)', () => {
  let app: INestApplication<App>;
  let admin: string;
  let reviewer: string;
  let sales: string;
  let otherSales: { id: string; token: string };
  let otherReviewer: { id: string; token: string };
  let draft: MerchantApplication; // owned by SEED.sales
  let underReview: MerchantApplication; // owned by SEED.sales, assigned to SEED.reviewer

  beforeAll(async () => {
    app = await createTestApp();
    [admin, reviewer, sales] = await Promise.all([
      login(app, SEED.admin.email),
      login(app, SEED.reviewer.email),
      login(app, SEED.sales.email),
    ]);
    otherSales = await createStaff(app, admin, RoleType.SALES);
    otherReviewer = await createStaff(app, admin, RoleType.REVIEWER);

    draft = await createApplication(app, sales);
    underReview = await createApplication(app, sales);
    await submitAndAwaitRisk(app, underReview.id, sales);
    await http(app)
      .post(`${apps}/${underReview.id}/assign`)
      .set(bearer(admin))
      .send({ reviewerId: SEED.reviewer.id })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('every protected route requires a valid token', () => {
    const routes: Array<[string, string]> = [
      ['get', `${apps}`],
      ['post', `${apps}`],
      ['get', `${apps}/${SOME_ID}`],
      ['patch', `${apps}/${SOME_ID}`],
      ['post', `${apps}/${SOME_ID}/submit`],
      ['post', `${apps}/${SOME_ID}/assign`],
      ['post', `${apps}/${SOME_ID}/risk-review/retry`],
      ['post', `${apps}/${SOME_ID}/reviews`],
      ['post', `${API}/auth/register`],
      ['get', `${API}/auth/me`],
    ];

    it.each(routes)('%s %s -> 401 without a token', async (method, url) => {
      await (http(app) as any)[method](url).send({}).expect(401);
    });

    it('rejects a token signed with a different secret, even if it claims ADMIN', async () => {
      const forged = await new JwtService({ secret: 'attacker-secret' }).signAsync({
        sub: SEED.admin.id,
        email: SEED.admin.email,
        role: RoleType.ADMIN,
      });

      await http(app).get(apps).set(bearer(forged)).expect(401);
      await http(app).post(`${API}/auth/register`).set(bearer(forged)).send({}).expect(401);
    });

    it('rejects an unsigned token (alg "none")', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        sub: SEED.admin.id,
        email: SEED.admin.email,
        role: RoleType.ADMIN,
        exp: Math.floor(Date.now() / 1000) + 600,
      })}.`;

      await http(app).get(apps).set(bearer(unsigned)).expect(401);
    });

    it('rejects a valid token once the user has been deleted', async () => {
      const temp = await createStaff(app, admin, RoleType.SALES);
      await http(app).get(`${API}/auth/me`).set(bearer(temp.token)).expect(200);

      await app.get(DataSource).getRepository(User).delete({ id: temp.id });

      await http(app).get(`${API}/auth/me`).set(bearer(temp.token)).expect(401);
    });
  });

  describe('roles come from the database, not from the request', () => {
    it('ignores a role claim that disagrees with the stored role', async () => {
      // Correctly signed, but the SALES user's token claims ADMIN.
      const escalated = await new JwtService({ secret: TEST_SECRET }).signAsync({
        sub: SEED.sales.id,
        email: SEED.sales.email,
        role: RoleType.ADMIN,
      });

      await http(app)
        .post(`${apps}/${underReview.id}/assign`)
        .set(bearer(escalated))
        .send({ reviewerId: SEED.reviewer.id })
        .expect(403);
      await http(app)
        .post(`${API}/auth/register`)
        .set(bearer(escalated))
        .send({ email: `x-${randomUUID()}@e2e.test`, password: 'Sup3rSecret!', role: RoleType.ADMIN })
        .expect(403);
      const me = await http(app).get(`${API}/auth/me`).set(bearer(escalated)).expect(200);
      expect(me.body.role).toBe(RoleType.SALES);
    });

    it('ignores role-looking headers and query parameters', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/assign?role=ADMIN`)
        .set(bearer(sales))
        .set('X-User-Role', 'ADMIN')
        .set('X-Forwarded-User', SEED.admin.email)
        .send({ reviewerId: SEED.reviewer.id })
        .expect(403);
    });
  });

  describe('role-based access per endpoint', () => {
    it('REVIEWER cannot create, edit or submit applications', async () => {
      await http(app).post(apps).set(bearer(reviewer)).send(applicationPayload()).expect(403);
      await http(app).patch(`${apps}/${draft.id}`).set(bearer(reviewer)).send({ businessName: 'X' }).expect(403);
      await http(app).post(`${apps}/${draft.id}/submit`).set(bearer(reviewer)).expect(403);
    });

    it('SALES cannot assign reviewers, requeue risk reviews, record decisions or create users', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/assign`)
        .set(bearer(sales))
        .send({ reviewerId: SEED.reviewer.id })
        .expect(403);
      await http(app).post(`${apps}/${underReview.id}/risk-review/retry`).set(bearer(sales)).expect(403);
      await http(app)
        .post(`${apps}/${underReview.id}/reviews`)
        .set(bearer(sales))
        .send({ decision: ReviewDecision.APPROVE })
        .expect(403);
      await http(app)
        .post(`${API}/auth/register`)
        .set(bearer(sales))
        .send({ email: `x-${randomUUID()}@e2e.test`, password: 'Sup3rSecret!', role: RoleType.ADMIN })
        .expect(403);
    });

    it('ADMIN cannot record review decisions (separation of duties)', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/reviews`)
        .set(bearer(admin))
        .send({ decision: ReviewDecision.APPROVE })
        .expect(403);
    });

    it('ADMIN cannot assign a non-REVIEWER as reviewer', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/assign`)
        .set(bearer(admin))
        .send({ reviewerId: SEED.sales.id })
        .expect(400);
    });
  });

  describe('object-level access', () => {
    it("SALES cannot see another SALES user's application (404, no existence leak)", async () => {
      const res = await http(app).get(`${apps}/${draft.id}`).set(bearer(otherSales.token)).expect(404);
      const missing = await http(app).get(`${apps}/${SOME_ID}`).set(bearer(otherSales.token)).expect(404);
      expect(res.body.message).toBe(`Application ${draft.id} not found`);
      expect(missing.body.message).toBe(`Application ${SOME_ID} not found`);
    });

    it("SALES list only contains the caller's own applications", async () => {
      const res = await http(app).get(`${apps}?limit=100`).set(bearer(otherSales.token)).expect(200);
      expect(res.body.data.every((a: MerchantApplication) => a.created_by_id === otherSales.id)).toBe(true);
      expect(res.body.data.map((a: MerchantApplication) => a.id)).not.toContain(draft.id);
    });

    it("SALES cannot edit or submit another SALES user's application", async () => {
      await http(app)
        .patch(`${apps}/${draft.id}`)
        .set(bearer(otherSales.token))
        .send({ businessName: 'Hijacked' })
        .expect(404);
      await http(app).post(`${apps}/${draft.id}/submit`).set(bearer(otherSales.token)).expect(404);

      const unchanged = await getApplication(app, draft.id);
      expect(unchanged.business_name).toBe(draft.business_name);
      expect(unchanged.application_status).toBe(ApplicationStatus.DRAFT);
    });

    it('only the assigned REVIEWER can decide', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/reviews`)
        .set(bearer(otherReviewer.token))
        .send({ decision: ReviewDecision.APPROVE })
        .expect(403);

      expect((await getApplication(app, underReview.id)).application_status).toBe(ApplicationStatus.UNDER_REVIEW);
    });
  });

  describe('protected fields cannot be mass-assigned', () => {
    it.each([
      ['application_status', ApplicationStatus.APPROVED],
      ['applicationStatus', ApplicationStatus.APPROVED],
      ['risk_status', 'COMPLETED'],
      ['created_by_id', SEED.admin.id],
      ['assigned_reviewer_id', SEED.reviewer.id],
      ['id', SOME_ID],
    ])('create with %s -> 400', async (field, value) => {
      await http(app)
        .post(apps)
        .set(bearer(sales))
        .send({ ...applicationPayload(), [field]: value })
        .expect(400);
    });

    it('update cannot change status, owner or reviewer', async () => {
      for (const body of [
        { application_status: ApplicationStatus.APPROVED },
        { created_by_id: otherSales.id },
        { assigned_reviewer_id: SEED.reviewer.id },
      ]) {
        await http(app).patch(`${apps}/${draft.id}`).set(bearer(sales)).send(body).expect(400);
      }
      const unchanged = await getApplication(app, draft.id);
      expect(unchanged).toMatchObject({
        application_status: ApplicationStatus.DRAFT,
        created_by_id: SEED.sales.id,
        assigned_reviewer_id: null,
      });
    });

    it('a review cannot be attributed to another reviewer', async () => {
      await http(app)
        .post(`${apps}/${underReview.id}/reviews`)
        .set(bearer(otherReviewer.token))
        .send({ decision: ReviewDecision.APPROVE, reviewer_id: SEED.reviewer.id })
        .expect(400);
    });

    it('register cannot be used to escalate via extra fields', async () => {
      await http(app)
        .post(`${API}/auth/register`)
        .set(bearer(admin))
        .send({ email: `x-${randomUUID()}@e2e.test`, password: 'Sup3rSecret!', role: 'SUPERUSER' })
        .expect(400);
    });
  });

  it('rejects non-UUID ids before touching the database', async () => {
    await http(app).get(`${apps}/1 OR 1=1`).set(bearer(admin)).expect(400);
  });
});
