package config

type ObservabilityConfig struct {
	ServiceName string `koanf:"service_name" validate:"required"`
	Environment string `koanf:"environment" validate:"required"`
	Logging     string `koanf:"logging" validate:"required"`
	NewRelic    string `koanf:"new_relic" validate:"required"`
	HealthCheck string `koanf:"health_checks" validate:"required"`
}
