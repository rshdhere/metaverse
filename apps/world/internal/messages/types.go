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
type UserInfo struct {
	UserID string `json:"userId"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
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
	UserID string `json:"userId,omitempty"`
}
