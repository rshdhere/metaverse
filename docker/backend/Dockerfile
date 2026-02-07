# Containerize apps/server (uses @repo/api and workspace packages).
#
# Build context MUST be the repo root (so COPY sees apps/, packages/, etc.):
# From repo root:    docker build -f docker/backend/Dockerfile -t metaverse-backend .

FROM oven/bun:1-alpine AS base
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/validators/package.json ./packages/validators/
COPY tooling/typescript-config/package.json ./tooling/typescript-config/
COPY tooling/eslint-config/package.json ./tooling/eslint-config/
RUN bun install

# -----------------------------------------------------------------------------
# Stage: generate Prisma client (store is a dependency of api)
# -----------------------------------------------------------------------------
FROM deps AS prisma
COPY packages/store/ ./packages/store/
WORKDIR /app/packages/store
RUN bunx prisma generate
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: copy source and run server
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# Copy root package and lockfile
COPY package.json bun.lock* ./

# Copy workspace package manifests (for resolution)
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/validators/package.json ./packages/validators/
COPY tooling/typescript-config/package.json ./tooling/typescript-config/
COPY tooling/eslint-config/package.json ./tooling/eslint-config/

# Install production dependencies only
RUN bun install

# Copy source for server and all packages it depends on
COPY apps/server/ ./apps/server/
COPY packages/api/ ./packages/api/
COPY packages/config/ ./packages/config/
COPY packages/store/ ./packages/store/
COPY packages/validators/ ./packages/validators/
COPY tooling/typescript-config/ ./tooling/typescript-config/

# Overlay generated Prisma client (built in prisma stage; not in context due to .gitignore)
COPY --from=prisma /app/packages/store/generated ./packages/store/generated

ENV NODE_ENV=production
EXPOSE 8082

CMD ["bun", "run", "apps/server/src/bin.ts"]
