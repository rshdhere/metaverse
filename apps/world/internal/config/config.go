package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the WebSocket server
type Config struct {
	Port       string
	JWTSecret  string
	DBUrl      string
}

// Global config instance
var AppConfig *Config

// Load initializes configuration from environment variables
func Load() error {
	// Try to load .env from packages/config (relative to apps/world)
	envPath := filepath.Join("..", "..", "packages", "config", ".env")
	if err := godotenv.Load(envPath); err != nil {
		// Fallback: try loading from current directory
		_ = godotenv.Load()
	}

	AppConfig = &Config{
		Port:      getEnv("WS_PORT", "8083"),
		JWTSecret: getEnv("JWT_SECRET", ""),
		DBUrl:     getEnv("DATABASE_URL", ""),
	}

	return nil
}

// getEnv retrieves an environment variable with a fallback default
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
