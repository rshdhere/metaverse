# Containerize apps/client (Next.js; uses @repo/config, @repo/store, @repo/api).
#
# Build context MUST be the repo root (the Dockerfile copies apps/, packages/, etc.):
# From repo root:  docker build -f docker/frontend/Dockerfile -t metaverse-frontend .

FROM oven/bun:1-alpine AS base
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock* ./
COPY apps/client/package.json ./apps/client/
COPY packages/api/package.json ./packages/api/
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/validators/package.json ./packages/validators/
COPY tooling/typescript-config/package.json ./tooling/typescript-config/
COPY tooling/eslint-config/package.json ./tooling/eslint-config/
RUN bun install

# -----------------------------------------------------------------------------
# Stage: generate Prisma client (store is a dependency of client)
# -----------------------------------------------------------------------------
FROM deps AS prisma
COPY packages/store/ ./packages/store/
WORKDIR /app/packages/store
RUN bunx prisma generate
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: build Next.js app (standalone output)
# -----------------------------------------------------------------------------
FROM deps AS builder
COPY apps/client/ ./apps/client/
COPY packages/api/ ./packages/api/
COPY packages/config/ ./packages/config/
COPY packages/store/ ./packages/store/
COPY packages/validators/ ./packages/validators/
COPY tooling/typescript-config/ ./tooling/typescript-config/
COPY tooling/eslint-config/ ./tooling/eslint-config/

COPY --from=prisma /app/packages/store/generated ./packages/store/generated

WORKDIR /app/apps/client
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# -----------------------------------------------------------------------------
# Stage: run (minimal image with standalone output)
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/client/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/client/public ./apps/client/public

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/client/server.js"]
