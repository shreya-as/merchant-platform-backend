import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { RoleType } from '../../src/common/enums';
import { MerchantApplication } from '../../src/modules/merchant-applications/entities/merchant-application.entity';
import { SEED_BUSINESS_TYPES } from '../../src/database/seeds/data/roles.data';
import { SEED_USERS } from '../../src/database/seeds/data/users.data';

export const API = '/api/v1';
// Seed users' password: from SEED_USER_PASSWORD (see test/setup/load-env.ts), never hardcoded.
export const PASSWORD = process.env.SEED_USER_PASSWORD!;

const seedUser = (role: RoleType) => SEED_USERS.find((u) => u.role === role)!;
export const SEED = {
  admin: seedUser(RoleType.ADMIN),
  reviewer: seedUser(RoleType.REVIEWER),
  sales: seedUser(RoleType.SALES),
  businessTypeId: SEED_BUSINESS_TYPES[0].id,
};

// Boots the real AppModule (Postgres, Redis, BullMQ worker) wired exactly like main.ts.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

export const http = (app: INestApplication<App>) => request(app.getHttpServer());

export async function login(app: INestApplication<App>, email: string, password = PASSWORD): Promise<string> {
  const res = await http(app).post(`${API}/auth/login`).send({ email, password }).expect(200);
  return res.body.accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Creates an extra staff account through the ADMIN-only endpoint and returns its id + token.
export async function createStaff(
  app: INestApplication<App>,
  adminToken: string,
  role: RoleType,
): Promise<{ id: string; email: string; token: string }> {
  const email = `${role.toLowerCase()}-${randomUUID()}@e2e.test`;
  const res = await http(app)
    .post(`${API}/auth/register`)
    .set(bearer(adminToken))
    .send({ email, password: PASSWORD, role })
    .expect(201);
  return { id: res.body.id, email, token: await login(app, email) };
}

export function applicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    businessName: 'E2E Coffee',
    legalName: 'E2E Coffee LLC',
    businessTypeId: SEED.businessTypeId,
    registrationNumber: `REG-${randomUUID()}`, // unique: one open application per business
    taxId: 'US-EIN-123456789',
    country: 'US',
    ownerName: 'Pat Example',
    ownerEmail: 'pat@example.com',
    ownerPhone: '+15550123',
    requestedVolume: 5000,
    ...overrides,
  };
}

export async function createApplication(app: INestApplication<App>, token: string, overrides = {}) {
  const res = await http(app)
    .post(`${API}/merchant-applications`)
    .set(bearer(token))
    .send(applicationPayload(overrides))
    .expect(201);
  return res.body as MerchantApplication;
}

export async function getApplication(app: INestApplication<App>, id: string): Promise<MerchantApplication> {
  return app.get(DataSource).getRepository(MerchantApplication).findOneOrFail({
    where: { id },
    loadEagerRelations: false,
  });
}

// Polls until the async risk worker has moved the application where we expect it.
export async function waitForApplication(
  app: INestApplication<App>,
  id: string,
  predicate: (application: MerchantApplication) => boolean,
  timeoutMs = 10_000,
): Promise<MerchantApplication> {
  const deadline = Date.now() + timeoutMs;
  let last: MerchantApplication | undefined;
  while (Date.now() < deadline) {
    last = await getApplication(app, id);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for application ${id}; last state: ` +
      `${last?.application_status} / risk ${last?.risk_status}`,
  );
}

// Submits and waits for the risk review to finish (application lands in UNDER_REVIEW).
export async function submitAndAwaitRisk(app: INestApplication<App>, id: string, token: string) {
  await http(app).post(`${API}/merchant-applications/${id}/submit`).set(bearer(token)).expect(200);
  return waitForApplication(app, id, (a) => a.application_status === 'UNDER_REVIEW');
}
