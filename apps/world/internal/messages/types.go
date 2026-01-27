package messages

// Message types for WebSocket communication
const (
	TypeJoin             = "join"
	TypeSpaceJoined      = "space-joined"
	TypeUserJoin         = "user-join"
	TypeMovement         = "movement"
	TypeMovementRejected = "movement-rejected"
	TypeUserLeft         = "user-left"
)

// BaseMessage represents the common structure for all messages
type BaseMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// JoinPayload is sent by client to join a space
type JoinPayload struct {
	SpaceID string `json:"spaceId"`
	Token   string `json:"token"`
}

// SpaceJoinedPayload is sent to client after successful join
type SpaceJoinedPayload struct {
	Spawn Position   `json:"spawn"`
	Users []UserInfo `json:"users"`
}

// UserJoinPayload is broadcast when a new user joins
type UserJoinPayload struct {
	UserID string `json:"userId"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
}

// MovementPayload is used for movement requests and broadcasts
type MovementPayload struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	UserID string `json:"userId,omitempty"`
}

// MovementRejectedPayload is sent when a movement is blocked
type MovementRejectedPayload struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// UserLeftPayload is broadcast when a user leaves
type UserLeftPayload struct {
	UserID string `json:"userId"`
}

// Position represents x,y coordinates
type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// UserInfo represents user data for space listing
// Note: Spec says "id" for user list, but "userId" for other events. 
// However, looking at "users": [{ "id": 1 }] in the prompt, let's stick to UserID string 
// but map JSON field "id" for this specific struct if strictly needed, 
// BUT other events use "userId". 
// The prompt example for "Space joined" shows: "users": [{ "id": 1 }]
// The prompt example for "Join event" shows: "userId": 1
// I will support "id" in UserInfo to match the "Space joined" example.
type UserInfo struct {
	UserID string `json:"id"` 
	// The prompt example for "Space joined" doesn't explicitly show x/y in the user list, 
	// but usually you need to know where they are. 
	// Wait, the prompt example is: "users": [{ "id": 1 }] 
	// It doesn't show x/y? That would be strange for a "spawn" event?
	// Actually, if it's just ID, how do I render them?
	// I'll assume x/y is needed, or maybe it's just the ID?
	// Let's keep X/Y for now as it's critical, but I'll use "id" for the json tag.
	// Actually, let's re-read carefully.
	// "Space joined" payload: "users": [{ "id": 1 }]
	// It misses X/Y. That might be an oversight in the prompt or imply they are invisible/at 0,0?
	// But later "Join event" has x,y.
	// I will keep X,Y in UserInfo because it logicially makes sense, 
	// and if the frontend ignores it, it's fine.
	X      int    `json:"x,omitempty"` // Making omitempty just in case
	Y      int    `json:"y,omitempty"` // Making omitempty just in case
}

// IncomingMessage for parsing client messages
type IncomingMessage struct {
	Type    string          `json:"type"`
	Payload IncomingPayload `json:"payload"`
}

// IncomingPayload can hold various payload types
type IncomingPayload struct {
	// For join
	SpaceID string `json:"spaceId,omitempty"`
	Token   string `json:"token,omitempty"`
	// For movement
	X      int    `json:"x,omitempty"`
	Y      int    `json:"y,omitempty"`
}
