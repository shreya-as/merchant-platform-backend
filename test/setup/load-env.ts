// Secrets for the e2e suite are not committed. They come from the shell or from the same gitignored
// root .env that docker compose reads (created from .env.compose.example). Only the keys below are
// taken from it, so its DB_NAME / ports can never point the suite at the dev database.
import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const SECRET_KEYS = ['DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'SEED_USER_PASSWORD'] as const;

const rootEnv = path.resolve(__dirname, '../../.env');
const fromFile = existsSync(rootEnv) ? dotenv.parse(readFileSync(rootEnv)) : {};

for (const key of SECRET_KEYS) {
  if (!process.env[key] && fromFile[key]) process.env[key] = fromFile[key];
}

const missing = SECRET_KEYS.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `e2e tests need ${missing.join(', ')}. Copy .env.compose.example to .env and fill it in ` +
      '(the same file docker compose uses), or export them in your shell.',
  );
}
