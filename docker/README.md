# Docker Setup

## Backend (apps/server)

Build context **must be the repo root** (the Dockerfile copies `apps/`, `packages/`, etc.). If you run from `docker/backend/` with `.` as context, the build will fail with "not found".

**From repo root:**
```bash
docker build -f docker/backend/Dockerfile -t metaverse-backend .
```

**From `docker/backend/`:**
```bash
docker build -f Dockerfile -t metaverse-backend ../..
```

Run with env vars (e.g. `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ID_GITHUB`, `CLIENT_SECRET_GITHUB`, `RESEND_API_KEY`):

```bash
docker run --rm -p 3000:3000 -e DATABASE_URL=... -e JWT_SECRET=... metaverse-backend
```

## WebSocket (apps/world)

Build context **must be the repo root** (the Dockerfile copies `apps/world/`).

**From repo root:**
```bash
docker build -f docker/websocket/Dockerfile -t metaverse-websocket .
```

**From `docker/websocket/`:**
```bash
docker build -f Dockerfile -t metaverse-websocket ../..
```

Run with env vars (e.g. `WS_PORT`, `JWT_SECRET`, `DATABASE_URL`, `BACKEND_URL`, `WORLD_SERVER_SECRET`):

```bash
docker run --rm -p 8083:8083 -e JWT_SECRET=... -e DATABASE_URL=... metaverse-websocket
```

## Development

docker compose up --build
