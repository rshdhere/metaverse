# World - WebSocket Layer

Go-based WebSocket server for the metaverse using Gorilla WebSocket with fan-in/fan-out architecture.

## Quick Start

```bash
# Run the server
go run main.go

# Or build and run
go build -o world .
./world
```

## Environment Variables

The server reads from `packages/config/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | `8083` | WebSocket server port |
| `JWT_SECRET` | - | Secret for JWT validation |
| `DATABASE_URL` | - | PostgreSQL connection (future) |

## API

### WebSocket Endpoint

`ws://localhost:8083/ws`

### Health Check

`GET http://localhost:8083/health` → `{"status":"ok"}`

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `join` | → Server | Join space with token |
| `space-joined` | ← Server | Join acknowledgement |
| `user-join` | ← Server | User joined broadcast |
| `movement` | ↔ | Movement request/broadcast |
| `movement-rejected` | ← Server | Invalid movement |
| `user-left` | ← Server | User left broadcast |

### Example Messages

**Join a space:**
```json
{
  "type": "join",
  "payload": {
    "spaceId": "space-id",
    "token": "jwt-token"
  }
}
```

**Move:**
```json
{
  "type": "movement",
  "payload": {
    "x": 10,
    "y": 20
  }
}
```

## Testing

```bash
go test ./...
```

## Architecture

```
apps/world/
├── main.go                 # Entry point
├── internal/
│   ├── auth/jwt.go        # JWT validation
│   ├── config/config.go   # Environment config
│   ├── hub/
│   │   ├── hub.go         # Fan-in/fan-out coordinator
│   │   ├── client.go      # WebSocket client
│   │   ├── space.go       # Space & position validation
│   │   └── space_test.go  # Unit tests
│   └── messages/types.go  # Message definitions
```
