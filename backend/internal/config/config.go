package config

type Config struct{}

type Primary struct {
	env string `koanf:"env" validate:"required"`
}

type ServerConfig struct {
	Port               string   `koanf:"port" validate:"required"`
	ReadTimeout        int      `koanf:"read_timeout" validate:"required"`
	WriteTimeout       int      `koanf:"write_timeout" validate:"required"`
	IdleTimeout        int      `koanf:"idle_timeout" validate:"required"`
	CORSAllowedOrigins []string `koanf:"cors_allowed_origins" validate:"required"`
}

type DatabaseConfig struct {
	Host             string `koanf:"env" validate:"required"`
	Port             int    `koanf:"env" validate:"required"`
	User             string `koanf:"env" validate:"required"`
	Password         string `koanf:"env" validate:"required"`
	Name             string `koanf:"env" validate:"required"`
	SSLMode          string `koanf:"env" validate:"required"`
	MaxOpenConns     int    `koanf:"env" validate:"required"`
	MaxIdleConns     int    `koanf:"env" validate:"required"`
	ConnMaxLifetime  int    `koanf:"env" validate:"required"`
	ConnIdleLifetime int    `koanf:"env" validate:"required"`
}
