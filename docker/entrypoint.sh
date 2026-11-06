#!/bin/sh
set -e

# Apply pending migrations before the API starts (idempotent).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
fi

# Dev convenience: load demo roles, users and applications (idempotent upserts).
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding database..."
  node dist/database/seeds/seed.js
fi

exec "$@"
