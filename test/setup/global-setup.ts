// Runs once before the e2e suite: makes sure the test database exists, rebuilds the schema from the
// migrations, seeds roles / business types / users, and empties the test Redis DB (stale jobs).
import './load-env'; // must run before the data source reads the environment
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { configuration } from '../../src/config/configuration';
import { AppDataSource } from '../../src/database/data-source';
import { seedDatabase } from '../../src/database/seeds/seed-database';

export default async function globalSetup(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('e2e tests must run with NODE_ENV=test (they wipe the database). Use `pnpm test:e2e`.');
  }
  const config = configuration();
  if (!config.database.name.endsWith('_test')) {
    throw new Error(`Refusing to wipe "${config.database.name}": the e2e database name must end in _test.`);
  }

  await ensureDatabase(config.database);

  await AppDataSource.initialize();
  try {
    await AppDataSource.dropDatabase();
    await AppDataSource.runMigrations();
    await AppDataSource.transaction((manager) =>
      seedDatabase(manager, {
        userPassword: process.env.SEED_USER_PASSWORD!,
        saltRounds: config.auth.saltRounds,
        withApplications: false,
      }),
    );
  } finally {
    await AppDataSource.destroy();
  }

  const redis = new Redis({ ...config.redis, lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

async function ensureDatabase(db: ReturnType<typeof configuration>['database']): Promise<void> {
  // Connect to the maintenance DB: the test DB may not exist yet.
  const admin = new DataSource({
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: 'postgres',
  });
  await admin.initialize();
  try {
    const rows = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.name]);
    if (!rows.length) {
      await admin.query(`CREATE DATABASE "${db.name.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.destroy();
  }
}
