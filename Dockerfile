# syntax=docker/dockerfile:1

# ---------- deps + build ----------
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

# ---------- runtime ----------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node docker/entrypoint.sh ./entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["sh", "./entrypoint.sh"]
CMD ["node", "dist/main.js"]
