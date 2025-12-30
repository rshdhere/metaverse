package logger

import (
	"fmt"

	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/rshdhere/metaverse/internal/config"
)

type LoggerService struct {
	nrApp *newrelic.Application
}

func NewLoggerService(cfg *config.MonitoringConfig) *LoggerService {
	service := &LoggerService{}

	if cfg.NewRelic.LicenseKey == "" {
		fmt.Println("Newrelic license-key not provided, skipping initialization")
		return service
	}
}
