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
	Host             string `koanf:"host" validate:"required"`
	Port             int    `koanf:"port" validate:"required"`
	User             string `koanf:"user" validate:"required"`
	Password         string `koanf:"password"`
	Name             string `koanf:"name" validate:"required"`
	SSLMode          string `koanf:"ssl_mode" validate:"required"`
	MaxOpenConns     int    `koanf:"max_open_conns" validate:"required"`
	MaxIdleConns     int    `koanf:"max_idle_conns" validate:"required"`
	ConnMaxLifetime  int    `koanf:"conns_max_life_time" validate:"required"`
	ConnIdleLifetime int    `koanf:"conns_max_life_time" validate:"required"`
}

type AuthConfig struct {
	SecretKey string `koanf:"secret_key" validate:"required"`
}
