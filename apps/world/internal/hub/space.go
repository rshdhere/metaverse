package hub

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// Space represents a virtual space with users
type Space struct {
	ID      string
	Width   int
	Height  int
	Users    map[string]*Client // userID -> Client
	Elements map[string]bool    // "x,y" -> true if occupied by static element
	AudioProximity map[string]map[string]bool
	VideoProximity map[string]map[string]bool
	// VideoDwellStart tracks when each user pair entered video proximity.
	// Key format: "userA:userB" (sorted alphabetically).
	VideoDwellStart map[string]time.Time
	
	// MeetingStates tracks active meeting negotiations and sessions
	MeetingStates map[string]*MeetingState
	
	mu       sync.RWMutex
}

type MeetingStatus int

const (
	MeetingStatusPrompted MeetingStatus = iota
	MeetingStatusActive
)

type MeetingState struct {
	MeetingID     string // Unique ID for this specific meeting instance
	RequestID     string
	UserA         string
	UserB         string
	AcceptA       bool
	AcceptB       bool
	ExpiresAt     time.Time
	Status        MeetingStatus
	CooldownUntil time.Time
}

// Constants for meeting logic
const (
	MeetingTimeout  = 15 * time.Second
	MeetingCooldown = 10 * time.Second
	VideoDwellDuration = 3 * time.Second
)


// NewSpace creates a new Space instance
func NewSpace(id string, width, height int) *Space {
	return &Space{
		ID:       id,
		Width:    width,
		Height:   height,
		Users:    make(map[string]*Client),
		Elements: make(map[string]bool),
		AudioProximity: make(map[string]map[string]bool),
		VideoProximity: make(map[string]map[string]bool),
		VideoDwellStart: make(map[string]time.Time),
		MeetingStates:   make(map[string]*MeetingState),
	}
}


// AddUser adds a user to the space
func (s *Space) AddUser(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Users[client.UserID] = client
}

// RemoveUserAndCollectProximityLeaves removes the user and returns proximity leave events.
// Returns true if the user was actually removed (matched the client).
func (s *Space) RemoveUserAndCollectProximityLeaves(client *Client) (bool, []ProximityEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.Users[client.UserID]; ok && existing == client {
		// Clean up any active meetings involving this user
		s.cleanupMeetingsForUserLocked(client.UserID)

		leaveEvents := make([]ProximityEvent, 0)
		leaveEvents = append(
			leaveEvents,
			s.collectProximityLeavesLocked(client.UserID, "audio")...,
		)
		leaveEvents = append(
			leaveEvents,
			s.collectProximityLeavesLocked(client.UserID, "video")...,
		)
		delete(s.Users, client.UserID)
		return true, leaveEvents
	}

	return false, nil
}

func (s *Space) cleanupMeetingsForUserLocked(userID string) {
	for key, state := range s.MeetingStates {
		if state.UserA == userID || state.UserB == userID {
			// Notify the other user if meeting was active
			var otherID string
			if state.UserA == userID {
				otherID = state.UserB
			} else {
				otherID = state.UserA
			}

			if otherClient, ok := s.Users[otherID]; ok {
				// Send meeting-end event
				otherClient.SendJSON(map[string]interface{}{
					"type": "meeting-end",
					"payload": map[string]string{
						"peerId": userID,
						"meetingId": state.MeetingID,
						"reason": "user_left",
					},
				})
			}
			delete(s.MeetingStates, key)
		}
	}
	
	// Also clean up dwell timers
	for key := range s.VideoDwellStart {
		// key is "userA:userB"
		if len(key) > len(userID) && (key[:len(userID)] == userID || key[len(key)-len(userID):] == userID) {
			delete(s.VideoDwellStart, key)
		}
	}
}

func (s *Space) collectProximityLeavesLocked(userID string, media string) []ProximityEvent {
	proximity := s.getProximityMapLocked(media)
	events := make([]ProximityEvent, 0)
	if neighbors, ok := proximity[userID]; ok {
		for otherID := range neighbors {
			delete(neighbors, otherID)
			if otherNeighbors, ok := proximity[otherID]; ok {
				delete(otherNeighbors, userID)
			}
			// Clean up dwell timer for video proximity
			if media == "video" {
				key := dwellKey(userID, otherID)
				delete(s.VideoDwellStart, key)
			}
			events = append(events, ProximityEvent{
				Type:   ProximityLeave,
				UserA:  userID,
				UserB:  otherID,
				SpaceID: s.ID,
				Media:  media,
			})
		}
	}
	delete(proximity, userID)
	return events
}


// GetUsers returns a slice of all users in the space except the given userID
func (s *Space) GetUsers(excludeUserID string) []*Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	users := make([]*Client, 0, len(s.Users))
	for id, client := range s.Users {
		if id != excludeUserID {
			users = append(users, client)
		}
	}
	return users
}

// GetAllUsers returns all users in the space
func (s *Space) GetAllUsers() []*Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	users := make([]*Client, 0, len(s.Users))
	for _, client := range s.Users {
		users = append(users, client)
	}
	return users
}

// IsEmpty returns true if the space has no users
func (s *Space) IsEmpty() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.Users) == 0
}

// IsValidPosition checks if a position is within bounds
func (s *Space) IsValidPosition(x, y float64) bool {
	return x >= 0 && x < float64(s.Width) && y >= 0 && y < float64(s.Height)
}

// IsColliding checks if a position is occupied by a user or static element
// Returns true if colliding, false if free
func (s *Space) IsColliding(x, y float64, excludeUserID string) bool {
	// Check bounds
	if !s.IsValidPosition(x, y) {
		return true
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	// Check static elements
	// Using a simple "x,y" string key for now
	key := posKey(x, y)
	if s.Elements[key] {
		return true
	}

	// Check other users
	for _, user := range s.Users {
		if user.UserID == excludeUserID {
			continue
		}
		ux, uy := user.GetPosition()
		if ux == x && uy == y {
			return true
		}
	}

	return false
}

// Helper to generate key for position map (rounds to nearest int)
func posKey(x, y float64) string {
	return fmt.Sprintf("%d,%d", int(x), int(y))
}


// IsValidMove checks if a movement is valid (at most 1 block in any direction)
func IsValidMove(oldX, oldY, newX, newY float64) bool {
	dx := abs(newX - oldX)
	dy := abs(newY - oldY)
	// Allow movement of at most 20 blocks total (relaxed for pixel movement)
	return dx <= 20 && dy <= 20
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// dwellKey generates a consistent key for two users (lexicographically updated)
func dwellKey(u1, u2 string) string {
	if u1 < u2 {
		return u1 + ":" + u2
	}
	return u2 + ":" + u1
}

// CheckVideoDwellTimers checks all pending video dwell timers and emits MEETING PROMPTS directly via WebSocket.
// This replaces the backend poller mechanism.
func (s *Space) CheckVideoDwellTimers() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	toDelete := make([]string, 0)

	for key, dwellStart := range s.VideoDwellStart {
		// Clean up expired or stale meetings logic is separate, 
		// but here we check if we should TRIGGER a new meeting prompt.
		
		// Parse user IDs from key
		var userA, userB string
		for i := 0; i < len(key); i++ {
			if key[i] == ':' {
				userA = key[:i]
				userB = key[i+1:]
				break
			}
		}
		if userA == "" || userB == "" {
			toDelete = append(toDelete, key)
			continue
		}

		// Verify users exist
		clientA, existsA := s.Users[userA]
		clientB, existsB := s.Users[userB]
		if !existsA || !existsB {
			toDelete = append(toDelete, key)
			continue
		}

		// Check proximity distance
		xA, yA := clientA.GetPosition()
		xB, yB := clientB.GetPosition()
		dist := distance(xA, yA, xB, yB)
		if dist > 120 { 
			// Dwell broken (moved away)
			toDelete = append(toDelete, key)
			continue
		}

		// Check if checking for dwell timer completion
		if now.Sub(dwellStart) >= VideoDwellDuration {
			// DWELL COMPLETE!
			
			// Check if already in a meeting or cooldown
			meetingState, hasMeeting := s.MeetingStates[key]
			
			if hasMeeting {
				if meetingState.Status == MeetingStatusActive {
					// Already happy meeting, do nothing
					continue 
				}
				if now.Before(meetingState.CooldownUntil) {
					// In cooldown, ignore
					continue
				}
				if meetingState.ExpiresAt.After(now) && meetingState.RequestID != "" {
					// Prompt pending, ignore
					continue
				}
			}

			// Create new meeting prompt
			requestID := fmt.Sprintf("%d-%s-%s", now.UnixNano(), userA, userB)
			meetingID := fmt.Sprintf("%s-%s-%d", userA, userB, now.Unix())
			expiresAt := now.Add(MeetingTimeout)
			
			newState := &MeetingState{
				MeetingID: meetingID,
				RequestID: requestID,
				UserA:     userA,
				UserB:     userB,
				ExpiresAt: expiresAt,
				Status:    MeetingStatusPrompted,
			}
			s.MeetingStates[key] = newState

			log.Printf("Space %s: Sending meeting prompt to %s and %s (reqID: %s)", s.ID, userA, userB, requestID)

			// Send WebSocket events
			promptPayload := map[string]interface{}{
				"type": "meeting-prompt",
				"payload": map[string]interface{}{
					"requestId": requestID,
					"meetingId": meetingID,
					"expiresAt": expiresAt.UnixMilli(),
				},
			}

			// Send to A (peer is B)
			payloadA := promptPayload["payload"].(map[string]interface{})
			payloadA["peerId"] = userB
			clientA.SendJSON(promptPayload)

			// Send to B (peer is A)
			payloadB := make(map[string]interface{})
			for k, v := range payloadA { payloadB[k] = v } // shallow copy
			payloadB["peerId"] = userA
			promptPayload["payload"] = payloadB
			clientB.SendJSON(promptPayload)
			
			// We remove the dwell start so it doesn't trigger again immediately
			// (wait for cooldown or next interaction)
			toDelete = append(toDelete, key)
		}
	}

	for _, key := range toDelete {
		delete(s.VideoDwellStart, key)
	}

	// Also cleanup expired meeting states
	for key, state := range s.MeetingStates {
		if state.Status != MeetingStatusActive && state.ExpiresAt.Before(now) && state.CooldownUntil.IsZero() {
			// Expired prompt, no cooldown set? Set cooldown
			state.CooldownUntil = now.Add(MeetingCooldown)
			state.RequestID = ""
		}
		// If cooled down and inactive, can remove state entirely to allow fresh dwell
		if state.Status != MeetingStatusActive && !state.CooldownUntil.IsZero() && now.After(state.CooldownUntil) {
			delete(s.MeetingStates, key)
		}
	}
}
