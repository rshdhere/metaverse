package hub

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"

	"world/internal/auth"
	"world/internal/messages"
)

// Hub maintains the set of active clients and broadcasts messages
// It serves as the central coordinator for the fan-in/fan-out pattern
type Hub struct {
	// Spaces maps spaceID to Space
	Spaces map[string]*Space

	// Clients maps connection to Client (for clients not yet in a space)
	Clients map[*Client]bool

	// Register channel for new connections
	Register chan *Client

	// Unregister channel for disconnections
	Unregister chan *Client

	mu sync.RWMutex
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		Spaces:     make(map[string]*Space),
		Clients:    make(map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected, total clients: %d", len(h.Clients))

		case client := <-h.Unregister:
			h.handleDisconnect(client)
		}
	}
}

// handleDisconnect handles client disconnection
func (h *Hub) handleDisconnect(client *Client) {
	h.mu.Lock()

	if _, ok := h.Clients[client]; ok {
		delete(h.Clients, client)
		close(client.Send)
	}

	spaceID := client.SpaceID
	userID := client.UserID
	var space *Space
	if spaceID != "" {
		space = h.Spaces[spaceID]
	}
	// Release lock before doing anything that might take a long time or acquire other locks
	// specifically checking space logic which might interact with broadcast
	h.mu.Unlock()

	if space != nil {
		// If client was in a space, remove them and notify others
		// This now returns true only if THIS client was the one in the space
		removed := space.RemoveUser(client)

		if removed {
			// Broadcast user-left to remaining users
			leaveMsg := messages.BaseMessage{
				Type: messages.TypeUserLeft,
				Payload: messages.UserLeftPayload{
					UserID: userID,
				},
			}
			h.broadcastToSpace(spaceID, leaveMsg, userID)

			// Clean up empty spaces
			if space.IsEmpty() {
				h.mu.Lock()
				// Double check existence under lock
				if _, ok := h.Spaces[spaceID]; ok && space.IsEmpty() {
					delete(h.Spaces, spaceID)
					log.Printf("Space %s removed (empty)", spaceID)
				}
				h.mu.Unlock()
			}
		}
	}
	log.Printf("Client %s disconnected", userID)
}

// ProcessMessage handles incoming messages from clients
func (h *Hub) ProcessMessage(client *Client, rawMessage []byte) {
	var msg messages.IncomingMessage
	if err := json.Unmarshal(rawMessage, &msg); err != nil {
		log.Printf("Error parsing message: %v", err)
		return
	}

	switch msg.Type {
	case messages.TypeJoin:
		h.handleJoin(client, msg.Payload)
	case messages.TypeMovement:
		h.handleMovement(client, msg.Payload)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// handleJoin processes a join request
func (h *Hub) handleJoin(client *Client, payload messages.IncomingPayload) {
	// Validate token
	claims, err := auth.ValidateToken(payload.Token)
	if err != nil {
		log.Printf("Invalid token: %v", err)
		// Send error response to client
		errorMsg := messages.BaseMessage{
			Type: messages.TypeJoinError,
			Payload: messages.JoinErrorPayload{
				Error: "Invalid or expired token",
			},
		}
		client.SendJSON(errorMsg)
		return
	}

	client.UserID = claims.UserID
	client.Role = claims.Role
	client.SpaceID = payload.SpaceID
	client.Name = payload.Name
	client.AvatarName = payload.AvatarName

	h.mu.Lock()
	// Get or create space (in production, you'd fetch dimensions from database)
	space, exists := h.Spaces[payload.SpaceID]
	if !exists {
		// Default space dimensions - matching client map (40x32 width, 30x32 height)
		// "width":40, "height":30 in map.json, tile size 32
		space = NewSpace(payload.SpaceID, 1280, 960)
		h.Spaces[payload.SpaceID] = space
		log.Printf("Created new space: %s", payload.SpaceID)
	}

	// Get existing users before adding the new one
	existingUsers := make([]messages.UserInfo, 0)
	for _, u := range space.GetAllUsers() {
		ux, uy := u.GetPosition()
		log.Printf("📋 Existing user: %s at (%f, %f), Name: %s, Avatar: %s", u.UserID, ux, uy, u.Name, u.AvatarName)
		existingUsers = append(existingUsers, messages.UserInfo{
			UserID:     u.UserID,
			X:          ux,
			Y:          uy,
			Name:       u.Name,
			AvatarName: u.AvatarName,
		})
	}
	log.Printf("📊 Total existing users to send: %d", len(existingUsers))

	// Generate spawn position near the game's visible area
	// The client's MyPlayer spawns at (705, 500), so spawn others nearby
	// Use a central spawn point with small random offset to avoid stacking
	var spawnX, spawnY float64
	centerX := 705.0
	centerY := 500.0
	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		// Random offset: -50 to +50 from center
		spawnX = centerX + float64(rand.Intn(101)-50)
		spawnY = centerY + float64(rand.Intn(101)-50)
		if !space.IsColliding(spawnX, spawnY, "") {
			break
		}
	}
	client.SetPosition(spawnX, spawnY)

	// Add user to space
	space.AddUser(client)
	h.mu.Unlock()

	// Send space-joined to the joining user
	joinedMsg := messages.BaseMessage{
		Type: messages.TypeSpaceJoined,
		Payload: messages.SpaceJoinedPayload{
			SessionID: client.UserID,
			Spawn:     messages.Position{X: spawnX, Y: spawnY},
			Users:     existingUsers,
		},
	}
	client.SendJSON(joinedMsg)

	// Broadcast user-join to other users in the space
	userJoinMsg := messages.BaseMessage{
		Type: messages.TypeUserJoin,
		Payload: messages.UserJoinPayload{
			UserID:     client.UserID,
			X:          spawnX,
			Y:          spawnY,
			Name:       client.Name,
			AvatarName: client.AvatarName,
		},
	}
	h.broadcastToSpace(payload.SpaceID, userJoinMsg, client.UserID)

	log.Printf("User %s joined space %s at (%f, %f)", client.UserID, payload.SpaceID, spawnX, spawnY)
}

// handleMovement processes a movement request
func (h *Hub) handleMovement(client *Client, payload messages.IncomingPayload) {
	if client.SpaceID == "" {
		log.Printf("User %s tried to move without joining a space", client.UserID)
		return
	}

	h.mu.RLock()
	space, exists := h.Spaces[client.SpaceID]
	h.mu.RUnlock()

	if !exists {
		log.Printf("Space %s not found", client.SpaceID)
		return
	}

	oldX, oldY := client.GetPosition()
	newX, newY := payload.X, payload.Y

	// Validate movement
	// 1. Check if move distance is valid (step size)
	validMove := IsValidMove(oldX, oldY, newX, newY)

	// 2. Check collision (walls, elements, users)
	// We check IsColliding on the NEW position
	// Note: IsColliding checks bounds and elements/users.
	// However, we should temporarily exclude CURRENT user from check in IsColliding?
	// Actually IsColliding checks against s.Users. The current user IS in s.Users.
	// So IsColliding(newX, newY) will return true if the user moves to their OWN position (which is fine? or no?)
	// Wait, the user is currently at oldX, oldY in the map.
	// If newX, newY != oldX, oldY, then IsColliding won't find THIS user at newX, newY (unless there's ANOTHER user there).
	// So it should be fine.
	
	isColliding := space.IsColliding(newX, newY, client.UserID)
	
	if !validMove || isColliding {
		// Send movement-rejected with WHERE THEY SHOULD BE (old position)
		rejectMsg := messages.BaseMessage{
			Type: messages.TypeMovementRejected,
			Payload: messages.MovementRejectedPayload{
				X: oldX,
				Y: oldY,
			},
		}
		client.SendJSON(rejectMsg)
		log.Printf("Movement rejected for user %s: from (%f,%f) to (%f,%f). Colliding: %v, ValidMove: %v", 
			client.UserID, oldX, oldY, newX, newY, isColliding, validMove)
		return
	}

	// Update position
	client.SetPosition(newX, newY)

	client.Anim = payload.Anim

	// Broadcast movement to other users
	moveMsg := messages.BaseMessage{
		Type: messages.TypeMovement,
		Payload: messages.MovementPayload{
			X:      newX,
			Y:      newY,
			UserID: client.UserID,
			Anim:   client.Anim,
		},
	}
	h.broadcastToSpace(client.SpaceID, moveMsg, client.UserID)

	log.Printf("User %s moved from (%f,%f) to (%f,%f)", client.UserID, oldX, oldY, newX, newY)
}

// broadcastToSpace sends a message to all users in a space except the sender
func (h *Hub) broadcastToSpace(spaceID string, message interface{}, excludeUserID string) {
	h.mu.RLock()
	space, exists := h.Spaces[spaceID]
	h.mu.RUnlock()

	if !exists {
		log.Printf("⚠️ broadcastToSpace: space %s does not exist", spaceID)
		return
	}

	recipients := space.GetUsers(excludeUserID)
	log.Printf("📢 Broadcasting to space %s: %d recipients (excluding %s)", spaceID, len(recipients), excludeUserID)
	
	for _, client := range recipients {
		log.Printf("  → Sending to user %s", client.UserID)
		client.SendJSON(message)
	}
}
