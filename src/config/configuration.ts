// Unified configuration for the Merchant Payments & Operations Platform.

// This is the single source of truth for the entire application
export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'merchant-platform',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',

  // OpenAPI / Swagger UI. Served outside the API prefix: UI at /docs, JSON spec at /docs-json.
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH || 'docs',
  },

  // Database / Relational storage (PostgreSQL via TypeORM)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER || 'postgres',
    // No default: credentials always come from the environment.
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME || 'merchant_platform',
    synchronize: process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true',
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
    // No fallback in any environment: requireJwtSecret() fails the boot if it is unset or weak.
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
  },

  // Asynchronous Risk Assessment Worker & Queue configuration (BullMQ)
  // Configures retry backoff, exponential delays, and job deduplication keys.
  queue: {
    attempts: parseInt(process.env.BULLMQ_RETRY_ATTEMPTS ?? '3', 10),
    backoffDelayMs: parseInt(process.env.BULLMQ_BACKOFF_DELAY_MS ?? '2000', 10),
  },

  // Simulated Third-Party KYB / Risk Engine settings
  riskSimulation: {
    minScore: parseInt(process.env.RISK_MIN_SCORE ?? '0', 10),
    maxScore: parseInt(process.env.RISK_MAX_SCORE ?? '100', 10),
    autoPassThreshold: parseInt(process.env.RISK_PASS_THRESHOLD ?? '70', 10),
    simulatedLatencyMs: parseInt(process.env.RISK_SIMULATED_LATENCY_MS ?? '800', 10),
    // Share of provider calls that fail with a transient error, to exercise retries (0..1).
    transientFailureRate: parseFloat(process.env.RISK_TRANSIENT_FAILURE_RATE ?? '0'),
  },

  // Pagination & Operational defaults
  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT ?? '10', 10),
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT ?? '100', 10),
  },
});

export type AppConfig = ReturnType<typeof configuration>;