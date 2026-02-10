# Containerize apps/server (uses @repo/api and workspace packages).
#
# Build context MUST be the repo root (so COPY sees apps/, packages/, etc.):
# From repo root:    docker build -f docker/backend/Dockerfile -t metaverse-backend .

# -----------------------------------------------------------------------------
# Stage: base image (Debian-based for native module compatibility)
# Alpine uses musl libc which causes issues with native modules like mediasoup
# -----------------------------------------------------------------------------
FROM oven/bun:1.1.8 AS base

# Ensure system CA certificates are present so HTTPS (e.g. Kubernetes, TURN, etc.)
# works correctly inside the container.
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: builder - install dependencies with native build tools
# This stage compiles native modules like mediasoup worker
# -----------------------------------------------------------------------------
FROM base AS builder

# Install native build dependencies required for mediasoup
# - python3/pip: meson build system
# - make/g++: C++ compilation
# - nodejs/npm: required to run mediasoup's build scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests for all workspaces
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/config/package.json ./packages/config/
COPY packages/store/package.json ./packages/store/
COPY packages/validators/package.json ./packages/validators/
COPY tooling/typescript-config/package.json ./tooling/typescript-config/
COPY tooling/eslint-config/package.json ./tooling/eslint-config/

# Install all dependencies with bun
RUN bun install

# Manually build mediasoup worker (bun doesn't reliably run postinstall scripts)
# mediasoup requires Node.js to run its build scripts
RUN cd node_modules/mediasoup && npm run worker:build

# Verify mediasoup worker binary was built
RUN echo "=== Verifying mediasoup worker binary ===" && \
    ls -la node_modules/mediasoup/worker/out/Release/ && \
    test -f node_modules/mediasoup/worker/out/Release/mediasoup-worker && \
    echo "=== mediasoup-worker binary exists ==="

# -----------------------------------------------------------------------------
# Stage: generate Prisma client (store is a dependency of api)
# -----------------------------------------------------------------------------
FROM builder AS prisma
COPY packages/store/ ./packages/store/
WORKDIR /app/packages/store
RUN bunx prisma generate
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage: runner - final runtime image
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

# Copy pre-built node_modules from builder stage (includes compiled mediasoup worker)
COPY --from=builder /app/node_modules ./node_modules

# Copy source for server and all packages it depends on
COPY apps/server/ ./apps/server/
COPY packages/api/ ./packages/api/
COPY packages/config/ ./packages/config/
COPY packages/store/ ./packages/store/
COPY packages/validators/ ./packages/validators/
COPY tooling/typescript-config/ ./tooling/typescript-config/

# Overlay generated Prisma client (built in prisma stage; not in context due to .gitignore)
COPY --from=prisma /app/packages/store/generated ./packages/store/generated

# Final verification that mediasoup worker exists in runtime image
RUN echo "=== Final verification of mediasoup worker ===" && \
    ls -la node_modules/mediasoup/worker/out/Release/ && \
    test -f node_modules/mediasoup/worker/out/Release/mediasoup-worker && \
    echo "=== mediasoup-worker ready for runtime ==="

ENV NODE_ENV=production
EXPOSE 8082

CMD ["bun", "run", "apps/server/src/bin.ts"]
