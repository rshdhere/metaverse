package hub

import (
	"fmt"
	"sync"
)

// Space represents a virtual space with users
type Space struct {
	ID      string
	Width   int
	Height  int
	Users    map[string]*Client // userID -> Client
	Elements map[string]bool    // "x,y" -> true if occupied by static element
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
	}
}

// AddUser adds a user to the space
func (s *Space) AddUser(client *Client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Users[client.UserID] = client
}

// RemoveUser removes a user from the space
func (s *Space) RemoveUser(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Users, userID)
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
func (s *Space) IsValidPosition(x, y int) bool {
	return x >= 0 && x < s.Width && y >= 0 && y < s.Height
}

// IsColliding checks if a position is occupied by a user or static element
// Returns true if colliding, false if free
func (s *Space) IsColliding(x, y int) bool {
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
		ux, uy := user.GetPosition()
		if ux == x && uy == y {
			return true
		}
	}

	return false
}

// Helper to generate key for position map
func posKey(x, y int) string {
	return fmt.Sprintf("%d,%d", x, y)
}


// IsValidMove checks if a movement is valid (at most 1 block in any direction)
func IsValidMove(oldX, oldY, newX, newY int) bool {
	dx := abs(newX - oldX)
	dy := abs(newY - oldY)
	// Allow movement of at most 1 block total (including diagonal)
	return dx <= 1 && dy <= 1 && (dx + dy) <= 1
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
