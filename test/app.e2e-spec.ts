import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { API, createTestApp, http } from './utils/test-app';

// Boots the real AppModule: Postgres and Redis from src/config/env/.env.test must be reachable.
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves routes under the API prefix only', async () => {
    await http(app).get('/merchant-applications').expect(404);
    await http(app).get(`${API}/merchant-applications`).expect(401);
  });

  it('publishes the OpenAPI document with bearer auth', async () => {
    const res = await http(app).get('/docs-json').expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.components.securitySchemes['access-token']).toMatchObject({ scheme: 'bearer' });
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        `${API}/auth/login`,
        `${API}/merchant-applications`,
        `${API}/merchant-applications/{id}/submit`,
        `${API}/merchant-applications/{id}/reviews`,
      ]),
    );
  });

  it('serves the Swagger UI', async () => {
    await http(app).get('/docs').expect(200);
  });
});
