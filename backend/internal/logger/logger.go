package logger

import (
	"fmt"
	"os"
	"time"

	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/rs/zerolog"
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

	var ConfigOptions []newrelic.ConfigOption
	ConfigOptions = append(ConfigOptions,
		newrelic.ConfigAppName(cfg.ServiceName),
		newrelic.ConfigLicense(cfg.NewRelic.LicenseKey),
		newrelic.ConfigAppLogMetricsEnabled(cfg.NewRelic.AppLogForwardingEnabled),
		newrelic.ConfigDistributedTracerEnabled(cfg.NewRelic.DistributedTracingEnabled),
	)

	if cfg.NewRelic.DebugLogging {
		ConfigOptions = append(ConfigOptions, newrelic.ConfigDebugLogger(os.Stdout))
	}

	app, err := newrelic.NewApplication(ConfigOptions...)
	if err != nil {
		fmt.Printf("Failed to initialize Newrelic : %v/n", err)
	}

	service.nrApp = app
	fmt.Printf("Newrelic initialized for app: %s\n", cfg.ServiceName)
	return service
}

func (ls *LoggerService) Shutdown() {
	if ls.nrApp != nil {
		ls.nrApp.Shutdown(10 * time.Second)
	}
}

func (ls *LoggerService) GetApplication() *newrelic.Application {
	return ls.nrApp
}

func NewLogger(level string, isProd bool) zerolog.Logger {
	return NewLoggerWithService(&config.MonitoringConfig{
		Logging: config.LoggingConfig{
			Level: level,
		},
		Environment: func() string {
			if isProd {
				return "production"
			}
			return "development"
		}(),
	}, nil)
}
