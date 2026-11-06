import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { BusinessType } from '../../modules/merchant-applications/entities/business-type.entity';
import { MerchantApplication } from '../../modules/merchant-applications/entities/merchant-application.entity';
import { RiskAssessment } from '../../modules/risk/entities/risk-assessment.entity';
import { ApplicationReview } from '../../modules/reviews/entities/application-review.entity';
import { SEED_BUSINESS_TYPES, SEED_ROLES } from './data/roles.data';
import { SEED_USERS } from './data/users.data';
import { SEED_APPLICATIONS, SEED_REVIEWS, SEED_RISK_ASSESSMENTS } from './data/applications.data';

export interface SeedOptions {
  // Password given to every demo user. Required: never hardcoded.
  userPassword: string;
  saltRounds?: number;
  // Reference data + users only (used by the e2e suite, which creates its own applications).
  withApplications?: boolean;
}

// Idempotent: every row has a fixed id and is upserted, so re-running is safe.
// Insert order follows foreign keys: roles/business types -> users -> applications -> risk/reviews.
export async function seedDatabase(manager: EntityManager, options: SeedOptions): Promise<void> {
  const { userPassword, saltRounds = 10, withApplications = true } = options;

  await manager.upsert(Role, SEED_ROLES, ['id']);
  await manager.upsert(BusinessType, SEED_BUSINESS_TYPES, ['id']);

  const roleIdByName = new Map(SEED_ROLES.map((r) => [r.name, r.id]));
  const passwordHash = await bcrypt.hash(userPassword, saltRounds);
  const users = SEED_USERS.map(({ role, ...user }) => ({
    ...user,
    password_hash: passwordHash,
    role_id: roleIdByName.get(role)!,
  }));
  await manager.upsert(User, users, ['id']);

  if (!withApplications) return;

  const typeIdByCode = new Map(SEED_BUSINESS_TYPES.map((t) => [t.code, t.id]));
  const applications = SEED_APPLICATIONS.map(({ businessTypeCode, ...app }) => ({
    ...app,
    business_type_id: typeIdByCode.get(businessTypeCode)!,
  }));
  await manager.upsert(MerchantApplication, applications, ['id']);

  await manager.upsert(RiskAssessment, SEED_RISK_ASSESSMENTS, ['id']);
  await manager.upsert(ApplicationReview, SEED_REVIEWS, ['id']);
}
