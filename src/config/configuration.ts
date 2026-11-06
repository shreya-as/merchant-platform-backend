// Unified configuration for the Merchant Payments & Operations Platform.

// This is the single source of truth for the entire application, loaded
// into NestJS ConfigModule. It centralizes relational persistence (PostgreSQL/TypeORM),
// asynchronous risk execution & worker scheduling (BullMQ/Redis), authentication
// and crypt guardrails (JWT/Bcrypt), lifecycle risk simulation, and operational limits.
export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'merchant-platform',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',

  // Database / Relational storage (PostgreSQL via TypeORM)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgrespassword',
    name: process.env.DB_NAME || 'merchant_platform',
    synchronize: process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
  },

  // Redis cache & queue transport (Used by BullMQ for background risk processing)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },

  // Security & Authentication guardrails
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'merchant-platform-jwt-secret-key-change-in-prod',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
  },

  // Asynchronous Risk Assessment Worker & Queue configuration (BullMQ)
  // Configures retry backoff, exponential delays, and job deduplication keys.
  queue: {
    riskQueueName: process.env.BULLMQ_RISK_QUEUE_NAME || 'risk-assessment-queue',
    attempts: parseInt(process.env.BULLMQ_RETRY_ATTEMPTS ?? '3', 10),
    backoffDelayMs: parseInt(process.env.BULLMQ_BACKOFF_DELAY_MS ?? '2000', 10),
  },

  // Simulated Third-Party KYB / Risk Engine settings
  riskSimulation: {
    minScore: parseInt(process.env.RISK_MIN_SCORE ?? '0', 10),
    maxScore: parseInt(process.env.RISK_MAX_SCORE ?? '100', 10),
    autoPassThreshold: parseInt(process.env.RISK_PASS_THRESHOLD ?? '70', 10),
    simulatedLatencyMs: parseInt(process.env.RISK_SIMULATED_LATENCY_MS ?? '800', 10),
  },

  // Pagination & Operational defaults
  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT ?? '10', 10),
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT ?? '100', 10),
  },
});

export type AppConfig = ReturnType<typeof configuration>;