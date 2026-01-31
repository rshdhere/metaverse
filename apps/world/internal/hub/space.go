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
	// Used for 3-second dwell before triggering meeting prompts.
	VideoDwellStart map[string]time.Time
	mu       sync.RWMutex
}


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

// CheckVideoDwellTimers checks all pending video dwell timers and emits enter events
// for pairs that have been in proximity for the required duration.
// This should be called periodically from a background goroutine.
func (s *Space) CheckVideoDwellTimers() []ProximityEvent {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	events := make([]ProximityEvent, 0)
	toDelete := make([]string, 0)

	for key, dwellStart := range s.VideoDwellStart {
		if now.Sub(dwellStart) >= VideoDwellDuration {
			// Parse user IDs from key (format: "userA:userB")
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

			// Verify both users still exist and are still in proximity
			clientA, existsA := s.Users[userA]
			clientB, existsB := s.Users[userB]
			if !existsA || !existsB {
				toDelete = append(toDelete, key)
				continue
			}

			// Check if still in video proximity range
			xA, yA := clientA.GetPosition()
			xB, yB := clientB.GetPosition()
			dist := distance(xA, yA, xB, yB)
			if dist > 120 { // VideoRadius = 120
				toDelete = append(toDelete, key)
				continue
			}

			// They're in range and dwell time passed - mark as in proximity and emit event
			proximity := s.VideoProximity
			userSetA, okA := proximity[userA]
			if !okA {
				userSetA = make(map[string]bool)
				proximity[userA] = userSetA
			}
			userSetB, okB := proximity[userB]
			if !okB {
				userSetB = make(map[string]bool)
				proximity[userB] = userSetB
			}

			// Only emit if not already marked as in proximity
			if !userSetA[userB] {
				log.Printf("Space %s: Dwell time passed for %s and %s (dist=%f), emitting enter event", s.ID, userA, userB, dist)
				userSetA[userB] = true
				userSetB[userA] = true
				events = append(events, ProximityEvent{
					Type:    ProximityEnter,
					UserA:   userA,
					UserB:   userB,
					SpaceID: s.ID,
					Media:   "video",
				})
			} else {
                 log.Printf("Space %s: Dwell time passed but already in proximity for %s and %s", s.ID, userA, userB)
            }

			toDelete = append(toDelete, key)
		}
	}

	for _, key := range toDelete {
		delete(s.VideoDwellStart, key)
	}

	return events
}

