package auth

import (
	"testing"
	"time"

	"world/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

func TestValidateToken(t *testing.T) {
	// Setup config
	secret := "test-secret"
	config.AppConfig = &config.Config{
		JWTSecret: secret,
	}

	// Helper to generate token
	generateToken := func(userID, role string, expiration time.Time, signingKey string) string {
		claims := &Claims{
			UserID: userID,
			Role:   role,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(expiration),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		ss, _ := token.SignedString([]byte(signingKey))
		return ss
	}

	tests := []struct {
		name      string
		token     string
		wantID    string
		wantRole  string
		wantErr   bool
	}{
		{
			name:     "valid token",
			token:    generateToken("user1", "admin", time.Now().Add(time.Hour), secret),
			wantID:   "user1",
			wantRole: "admin",
			wantErr:  false,
		},
		{
			name:     "expired token",
			token:    generateToken("user1", "admin", time.Now().Add(-time.Hour), secret),
			wantErr:  true,
		},
		{
			name:     "wrong signature",
			token:    generateToken("user1", "admin", time.Now().Add(time.Hour), "wrong-secret"),
			wantErr:  true,
		},
		{
			name:     "malformed token",
			token:    "not.a.token",
			wantErr:  true,
		},
		{
			name:     "with bearer prefix",
			token:    "Bearer " + generateToken("user2", "user", time.Now().Add(time.Hour), secret),
			wantID:   "user2",
			wantRole: "user",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims, err := ValidateToken(tt.token)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateToken() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if claims.UserID != tt.wantID {
					t.Errorf("ValidateToken() UserID = %v, want %v", claims.UserID, tt.wantID)
				}
				if claims.Role != tt.wantRole {
					t.Errorf("ValidateToken() Role = %v, want %v", claims.Role, tt.wantRole)
				}
			}
		})
	}
}
