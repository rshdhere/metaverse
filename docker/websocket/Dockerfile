# Containerize apps/world (Go WebSocket server).
#
# Build context MUST be the repo root (so COPY sees apps/world):
# From repo root:  docker build -f docker/websocket/Dockerfile -t metaverse-websocket .

# -----------------------------------------------------------------------------
# Stage: build
# -----------------------------------------------------------------------------
FROM golang:1.23-alpine AS builder
WORKDIR /build

RUN apk add --no-cache ca-certificates

COPY apps/world/go.mod apps/world/go.sum ./
RUN go mod download

COPY apps/world/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /world .

# -----------------------------------------------------------------------------
# Stage: run
# -----------------------------------------------------------------------------
FROM alpine:3.19
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /world ./
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8083

# Config via env (WS_PORT, JWT_SECRET, DATABASE_URL, BACKEND_URL, WORLD_SERVER_SECRET)
CMD ["./world"]
