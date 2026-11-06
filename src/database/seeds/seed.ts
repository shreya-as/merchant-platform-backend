import { randomBytes } from 'crypto';
import { AppDataSource } from '../data-source';
import { SEED_BUSINESS_TYPES, SEED_ROLES } from './data/roles.data';
import { SEED_USERS } from './data/users.data';
import { SEED_APPLICATIONS, SEED_REVIEWS, SEED_RISK_ASSESSMENTS } from './data/applications.data';
import { seedDatabase } from './seed-database';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10);

async function runSeed() {
  // Demo accounts with a shared password must never appear in production by accident.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing to seed demo users with NODE_ENV=production. Set ALLOW_DEMO_SEED=true only for a local stack.',
    );
  }

  const configured = process.env.SEED_USER_PASSWORD;
  const userPassword = configured || randomBytes(12).toString('base64url');

  await AppDataSource.initialize();
  console.log('Database connected for seeding...');

  await AppDataSource.transaction((manager) =>
    seedDatabase(manager, { userPassword, saltRounds: SALT_ROUNDS }),
  );

  console.log(
    `Seeded ${SEED_ROLES.length} roles, ${SEED_BUSINESS_TYPES.length} business types, ` +
      `${SEED_USERS.length} users, ${SEED_APPLICATIONS.length} applications, ` +
      `${SEED_RISK_ASSESSMENTS.length} risk assessments, ` +
      `${SEED_REVIEWS.length} reviews.`,
  );
  console.log(
    configured
      ? 'Demo users use the password from SEED_USER_PASSWORD.'
      : `SEED_USER_PASSWORD not set; demo users got a random password (shown once): ${userPassword}`,
  );
}

runSeed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => AppDataSource.isInitialized && AppDataSource.destroy());
