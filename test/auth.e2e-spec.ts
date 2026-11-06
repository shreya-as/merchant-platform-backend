import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types';
import { RoleType } from '../src/common/enums';
import { API, PASSWORD, SEED, bearer, createTestApp, http, login } from './utils/test-app';

const TEST_SECRET = process.env.JWT_SECRET!; // loaded from .env.test by the data source

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await login(app, SEED.admin.email);
    salesToken = await login(app, SEED.sales.email);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns a JWT and the public profile, never the password hash', async () => {
      const res = await http(app)
        .post(`${API}/auth/login`)
        .send({ email: SEED.sales.email, password: PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toEqual({ id: SEED.sales.id, email: SEED.sales.email, role: RoleType.SALES });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('is case-insensitive on email', async () => {
      await http(app)
        .post(`${API}/auth/login`)
        .send({ email: SEED.sales.email.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await http(app)
        .post(`${API}/auth/login`)
        .send({ email: SEED.sales.email, password: 'nope' })
        .expect(401);
      const unknownEmail = await http(app)
        .post(`${API}/auth/login`)
        .send({ email: 'ghost@merchantplatform.com', password: 'nope' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid credentials');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('rejects malformed bodies and unknown fields', async () => {
      await http(app).post(`${API}/auth/login`).send({ email: 'not-an-email', password: 'x' }).expect(400);
      await http(app).post(`${API}/auth/login`).send({}).expect(400);
      await http(app)
        .post(`${API}/auth/login`)
        .send({ email: SEED.sales.email, password: PASSWORD, role: RoleType.ADMIN })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the caller for a valid token', async () => {
      const res = await http(app).get(`${API}/auth/me`).set(bearer(salesToken)).expect(200);

      expect(res.body).toEqual({ id: SEED.sales.id, email: SEED.sales.email, role: RoleType.SALES });
    });

    it.each([
      ['no Authorization header', undefined],
      ['a non-Bearer scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
      ['a garbage token', 'Bearer not.a.jwt'],
    ])('rejects %s with 401', async (_label, header) => {
      const req = http(app).get(`${API}/auth/me`);
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = await new JwtService({ secret: TEST_SECRET }).signAsync({
        sub: SEED.sales.id,
        email: SEED.sales.email,
        role: RoleType.SALES,
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      await http(app).get(`${API}/auth/me`).set(bearer(expired)).expect(401);
    });
  });

  describe('POST /auth/register', () => {
    const newUser = () => ({
      email: `new-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`,
      password: 'Sup3rSecret!',
      role: RoleType.REVIEWER,
    });

    it('lets ADMIN create a staff account that can then log in', async () => {
      const body = newUser();

      const res = await http(app).post(`${API}/auth/register`).set(bearer(adminToken)).send(body).expect(201);

      expect(res.body).toEqual({ id: expect.any(String), email: body.email, role: RoleType.REVIEWER });
      await login(app, body.email, body.password);
    });

    it('rejects a duplicate email with 409', async () => {
      const body = newUser();
      await http(app).post(`${API}/auth/register`).set(bearer(adminToken)).send(body).expect(201);
      await http(app).post(`${API}/auth/register`).set(bearer(adminToken)).send(body).expect(409);
    });

    it('requires authentication (no public self-registration)', async () => {
      await http(app).post(`${API}/auth/register`).send(newUser()).expect(401);
    });

    it('forbids non-ADMIN callers', async () => {
      await http(app).post(`${API}/auth/register`).set(bearer(salesToken)).send(newUser()).expect(403);
    });
  });
});
