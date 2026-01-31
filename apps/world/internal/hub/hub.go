package hub

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"
	"time"

	"world/internal/auth"
	"world/internal/config"
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
	// Start background goroutine for checking video dwell timers
	go h.runDwellTimerChecker()

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

// runDwellTimerChecker periodically checks all spaces for expired dwell timers
func (h *Hub) runDwellTimerChecker() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.RLock()
		spaces := make([]*Space, 0, len(h.Spaces))
		for _, space := range h.Spaces {
			spaces = append(spaces, space)
		}
		h.mu.RUnlock()

		for _, space := range spaces {
			// Now calls the updated method which handles Meeting Prompt emission directly
			space.CheckVideoDwellTimers()
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
	h.mu.Unlock()

	if space != nil {
		// If client was in a space, remove them and notify others
		removed, proximityEvents := space.RemoveUserAndCollectProximityLeaves(client)

		if removed {
			h.handleProximityEvents(proximityEvents)
			
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

// handleProximityEvents broadcasts proximity updates (mainly Audio) via WebSocket to relevant peers
// This replaces the backend HTTP bridge.
func (h *Hub) handleProximityEvents(events []ProximityEvent) {
	if len(events) == 0 {
		return
	}

	// Group events by Space to minimize lock contention if we need to look up space?
	// Actually we just need to send to UserA and UserB.
	
	for _, event := range events {
		// Only handle audio events here (Video events are handled by Meeting Prompts)
		// Or handle leaving video events if necessary?
		// ProximityLeave events for video might be useful to ensure client cleanup?
		// But MeetingEnd handles cleanup mostly.
		// Let's send all proximity updates to clients so they can decide (e.g. mute volume/stop subscribing).

		// Construct payload
		payload := map[string]interface{}{
			"type": event.Type, // "enter" or "leave"
			"peerId": event.UserB, // For UserA, the peer is UserB
			"media": event.Media,
		}

		// We need to send to UserA: "UserB entered/left your radius"
		h.sendToUser(event.SpaceID, event.UserA, messages.BaseMessage{
			Type: messages.TypeProximityUpdate,
			Payload: payload,
		})

		// And to UserB: "UserA entered/left your radius"
		payloadB := map[string]interface{}{
			"type": event.Type,
			"peerId": event.UserA,
			"media": event.Media,
		}
		h.sendToUser(event.SpaceID, event.UserB, messages.BaseMessage{
			Type: messages.TypeProximityUpdate,
			Payload: payloadB,
		})
	}
}

func (h *Hub) sendToUser(spaceID, userID string, msg messages.BaseMessage) {
	h.mu.RLock()
	space, ok := h.Spaces[spaceID]
	h.mu.RUnlock()
	if !ok { return }

	// Lock space just to get user? Or rely on thread-safe map read?
	// Users map is not thread safe without space lock.
	space.mu.RLock()
	client, ok := space.Users[userID]
	space.mu.RUnlock()
	
	if ok {
		client.SendJSON(msg)
	}
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
	case messages.TypeTeleport:
		h.handleTeleport(client, msg.Payload)
	case messages.TypeMeetingResponse: // NEW Handler
		h.handleMeetingResponse(client, msg.Payload)
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
		errorMsg := messages.BaseMessage{
			Type: messages.TypeJoinError,
			Payload: messages.JoinErrorPayload{Error: "Invalid or expired token"},
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
	space, exists := h.Spaces[payload.SpaceID]
	if !exists {
		space = NewSpace(payload.SpaceID, 1280, 960)
		h.Spaces[payload.SpaceID] = space
		log.Printf("Created new space: %s", payload.SpaceID)
	}

	existingUsers := make([]messages.UserInfo, 0)
	for _, u := range space.GetAllUsers() {
		ux, uy := u.GetPosition()
		existingUsers = append(existingUsers, messages.UserInfo{
			UserID:     u.UserID,
			X:          ux,
			Y:          uy,
			Name:       u.Name,
			AvatarName: u.AvatarName,
		})
	}

	// Spawn logic
	var spawnX, spawnY float64
	centerX := 705.0
	centerY := 500.0
	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		spawnX = centerX + float64(rand.Intn(101)-50)
		spawnY = centerY + float64(rand.Intn(101)-50)
		if !space.IsColliding(spawnX, spawnY, "") {
			break
		}
	}
	client.SetPosition(spawnX, spawnY)

	space.AddUser(client)
	h.mu.Unlock()

	// Initial proximity
	proximityEvents := append(
		space.UpdateProximityForUser(client, config.AppConfig.AudioRadius, "audio"),
		space.UpdateProximityForUser(client, config.AppConfig.VideoRadius, "video")...,
	)
	h.handleProximityEvents(proximityEvents)

	joinedMsg := messages.BaseMessage{
		Type: messages.TypeSpaceJoined,
		Payload: messages.SpaceJoinedPayload{
			SessionID: client.UserID,
			Spawn:     messages.Position{X: spawnX, Y: spawnY},
			Users:     existingUsers,
		},
	}
	client.SendJSON(joinedMsg)

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
	if client.SpaceID == "" { return }

	h.mu.RLock()
	space, exists := h.Spaces[client.SpaceID]
	h.mu.RUnlock()

	if !exists { return }

	oldX, oldY := client.GetPosition()
	newX, newY := payload.X, payload.Y

	validMove := IsValidMove(oldX, oldY, newX, newY)
	isColliding := space.IsColliding(newX, newY, client.UserID)
	
	if !validMove || isColliding {
		rejectMsg := messages.BaseMessage{
			Type: messages.TypeMovementRejected,
			Payload: messages.MovementRejectedPayload{X: oldX, Y: oldY},
		}
		client.SendJSON(rejectMsg)
		return
	}

	client.SetPosition(newX, newY)
	client.Anim = payload.Anim

	proximityEvents := append(
		space.UpdateProximityForUser(client, config.AppConfig.AudioRadius, "audio"),
		space.UpdateProximityForUser(client, config.AppConfig.VideoRadius, "video")...,
	)
	h.handleProximityEvents(proximityEvents)

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
}

// handleTeleport processes a teleport request
func (h *Hub) handleTeleport(client *Client, payload messages.IncomingPayload) {
	if client.SpaceID == "" { return }

	h.mu.RLock()
	space, exists := h.Spaces[client.SpaceID]
	h.mu.RUnlock()

	if !exists { return }

	oldX, oldY := client.GetPosition()
	newX, newY := payload.X, payload.Y

	isColliding := space.IsColliding(newX, newY, client.UserID)

	if isColliding {
		rejectMsg := messages.BaseMessage{
			Type: messages.TypeMovementRejected,
			Payload: messages.MovementRejectedPayload{X: oldX, Y: oldY},
		}
		client.SendJSON(rejectMsg)
		return
	}

	client.SetPosition(newX, newY)
	client.Anim = payload.Anim

	proximityEvents := append(
		space.UpdateProximityForUser(client, config.AppConfig.AudioRadius, "audio"),
		space.UpdateProximityForUser(client, config.AppConfig.VideoRadius, "video")...,
	)
	h.handleProximityEvents(proximityEvents)

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
}

// handleMeetingResponse processes a user accepting or declining a meeting prompt
func (h *Hub) handleMeetingResponse(client *Client, payload messages.IncomingPayload) {
	if client.SpaceID == "" { return }

	h.mu.RLock()
	space, exists := h.Spaces[client.SpaceID]
	h.mu.RUnlock()
	if !exists { return }

	// Logic to update MeetingState
	space.mu.Lock()
	defer space.mu.Unlock()

	// Find the meeting state - key is sort(UserA, UserB) or RequestID?
	// We might not have the key handy unless we reconstruct it or search.
	// But we have PeerID, so we can construct key.
	if payload.PeerID == "" { return }
	key := dwellKey(client.UserID, payload.PeerID)
	
	state, ok := space.MeetingStates[key]
	if !ok {
		log.Printf("Meeting response ignored: no active meeting state for %s-%s", client.UserID, payload.PeerID)
		return
	}

	if state.Status == MeetingStatusActive {
		// Already active, ignore response
		return
	}
	
	if state.RequestID != payload.RequestID {
		log.Printf("Meeting response ignored: requestId mismatch %s vs %s", state.RequestID, payload.RequestID)
		return
	}
	
	if !payload.Accept {
		// Declined
		log.Printf("Meeting declined by %s", client.UserID)
		delete(space.MeetingStates, key)
		// Send cancellation/declined info?
		return
	}

	// Accepted
	if client.UserID == state.UserA {
		state.AcceptA = true
	} else if client.UserID == state.UserB {
		state.AcceptB = true
	}

	if state.AcceptA && state.AcceptB {
		log.Printf("Meeting STARTING between %s and %s", state.UserA, state.UserB)
		state.Status = MeetingStatusActive
		state.RequestID = "" // Clear request ID
		
		// Send MEETING_START to both
		msg := messages.BaseMessage{
			Type: messages.TypeMeetingStart,
		}
		
		// To A
		msg.Payload = map[string]string{
			"peerId": state.UserB,
			"meetingId": state.MeetingID,
		}
		if uA, ok := space.Users[state.UserA]; ok {
			uA.SendJSON(msg)
		}
		
		// To B
		msg.Payload = map[string]string{
			"peerId": state.UserA,
			"meetingId": state.MeetingID,
		}
		if uB, ok := space.Users[state.UserB]; ok {
			uB.SendJSON(msg)
		}
	}
}


// broadcastToSpace sends a message to all users in a space except the sender
func (h *Hub) broadcastToSpace(spaceID string, message interface{}, excludeUserID string) {
	h.mu.RLock()
	space, exists := h.Spaces[spaceID]
	h.mu.RUnlock()

	if !exists { return }

	recipients := space.GetUsers(excludeUserID)
	
	for _, client := range recipients {
		client.SendJSON(message)
	}
}
