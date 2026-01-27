package hub

import "testing"

func TestIsValidMove(t *testing.T) {
	tests := []struct {
		name     string
		oldX     float64
		oldY     float64
		newX     float64
		newY     float64
		expected bool
	}{
		// Valid moves
		{"move right 1", 5, 5, 6, 5, true},
		{"move left 1", 5, 5, 4, 5, true},
		{"move up 1", 5, 5, 5, 4, true},
		{"move down 1", 5, 5, 5, 6, true},
		{"stay in place", 5, 5, 5, 5, true},

		// Invalid moves - too far
		{"move right 2", 5, 5, 7, 5, false},
		{"move left 2", 5, 5, 3, 5, false},
		{"move up 2", 5, 5, 5, 3, false},
		{"move down 2", 5, 5, 5, 7, false},

		// Invalid moves - diagonal (dx + dy > 1)
		{"diagonal move", 5, 5, 6, 6, false},
		{"diagonal move opposite", 5, 5, 4, 4, false},

		// Edge cases
		{"large move", 5, 5, 100, 100, false},
		{"move from origin", 0, 0, 1, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsValidMove(tt.oldX, tt.oldY, tt.newX, tt.newY)
			if result != tt.expected {
				t.Errorf("IsValidMove(%f, %f, %f, %f) = %v; want %v",
					tt.oldX, tt.oldY, tt.newX, tt.newY, result, tt.expected)
			}
		})
	}
}

func TestSpaceIsValidPosition(t *testing.T) {
	space := NewSpace("test-space", 100, 200)

	tests := []struct {
		name     string
		x        float64
		y        float64
		expected bool
	}{
		// Valid positions
		{"origin", 0, 0, true},
		{"middle", 50, 100, true},
		{"max valid", 99, 199, true},
		
		// Invalid positions - out of bounds
		{"x too large", 100, 100, false},
		{"y too large", 50, 200, false},
		{"both too large", 100, 200, false},
		{"x negative", -1, 50, false},
		{"y negative", 50, -1, false},
		{"way out of bounds", 1000000, 2000000, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := space.IsValidPosition(tt.x, tt.y)
			if result != tt.expected {
				t.Errorf("IsValidPosition(%f, %f) = %v; want %v",
					tt.x, tt.y, result, tt.expected)
			}
		})
	}
}

func TestSpaceIsColliding(t *testing.T) {
	space := NewSpace("test-space", 10, 10)
	
	// Add a static element
	space.Elements["5,5"] = true

	// Add a user
	user := &Client{UserID: "user1", X: 2, Y: 2}
	space.AddUser(user)

	tests := []struct {
		name     string
		x        float64
		y        float64
		expected bool // true = collision
	}{
		// No collision
		{"empty spot", 0, 0, false},
		{"near element", 5, 4, false},
		{"near user", 2, 3, false},

		// Collisions
		{"out of bounds negative", -1, 0, true},
		{"out of bounds large", 10, 10, true}, // 0-9 is valid
		{"static element", 5, 5, true},
		{"user collision", 2, 2, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := space.IsColliding(tt.x, tt.y)
			if result != tt.expected {
				t.Errorf("IsColliding(%f, %f) = %v; want %v",
					tt.x, tt.y, result, tt.expected)
			}
		})
	}
}
