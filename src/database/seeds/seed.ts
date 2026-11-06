import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { BusinessType } from '../../modules/merchant-applications/entities/business-type.entity';
import { MerchantApplication } from '../../modules/merchant-applications/entities/merchant-application.entity';
import { RiskAssessment } from '../../modules/risk/entities/risk-assessment.entity';
import { ApplicationReview } from '../../modules/reviews/entities/application-review.entity';
import { SEED_BUSINESS_TYPES, SEED_ROLES } from './data/roles.data';
import { SEED_USERS } from './data/users.data';
import {
  SEED_APPLICATIONS,
  SEED_REVIEWS,
  SEED_RISK_ASSESSMENTS,
} from './data/applications.data';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10);

// Idempotent: every row has a fixed id and is upserted, so re-running is safe.
async function runSeed() {
  await AppDataSource.initialize();
  console.log('Database connected for seeding...');

  await AppDataSource.transaction(async (manager) => {
    await manager.upsert(Role, SEED_ROLES, ['id']);
    await manager.upsert(BusinessType, SEED_BUSINESS_TYPES, ['id']);

    const roleIdByName = new Map(SEED_ROLES.map((r) => [r.name, r.id]));
    const users = await Promise.all(
      SEED_USERS.map(async ({ password, role, ...user }) => ({
        ...user,
        password_hash: await bcrypt.hash(password, SALT_ROUNDS),
        role_id: roleIdByName.get(role)!,
      })),
    );
    await manager.upsert(User, users, ['id']);

    const typeIdByCode = new Map(SEED_BUSINESS_TYPES.map((t) => [t.code, t.id]));
    const applications = SEED_APPLICATIONS.map(({ businessTypeCode, ...app }) => ({
      ...app,
      business_type_id: typeIdByCode.get(businessTypeCode)!,
    }));
    await manager.upsert(MerchantApplication, applications, ['id']);

    await manager.upsert(RiskAssessment, SEED_RISK_ASSESSMENTS, ['id']);
    await manager.upsert(ApplicationReview, SEED_REVIEWS, ['id']);
  });

  console.log(
    `Seeded ${SEED_ROLES.length} roles, ${SEED_BUSINESS_TYPES.length} business types, ` +
      `${SEED_USERS.length} users, ${SEED_APPLICATIONS.length} applications, ` +
      `${SEED_RISK_ASSESSMENTS.length} risk assessments, ${SEED_REVIEWS.length} reviews.`,
  );
}

runSeed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => AppDataSource.isInitialized && AppDataSource.destroy());
