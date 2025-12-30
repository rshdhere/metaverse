package logger

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/newrelic/go-agent/v3/integrations/logcontext-v2/zerologWriter"
	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/pkgerrors"
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

func NewLoggerWithConfig(cfg *config.MonitoringConfig) zerolog.Logger {
	return NewLoggerWithService(cfg, nil)
}

func NewLoggerWithService(cfg *config.MonitoringConfig, loggerService *LoggerService) zerolog.Logger {
	var logLevel zerolog.Level
	level := cfg.GetLogLevel()

	switch level {
	case "debug":
		logLevel = zerolog.DebugLevel
	case "info":
		logLevel = zerolog.InfoLevel
	case "warn":
		logLevel = zerolog.WarnLevel
	case "error":
		logLevel = zerolog.ErrorLevel
	default:
		logLevel = zerolog.InfoLevel
	}

	zerolog.TimeFieldFormat = "2006-01-02 15:04:05"
	zerolog.ErrorStackMarshaler = pkgerrors.MarshalStack

	var writer io.Writer

	var baseWriter io.Writer
	if cfg.IsProduction() && cfg.Logging.Format == "json" {

		baseWriter = os.Stdout

		if loggerService != nil && loggerService.nrApp != nil {
			nrWriter := zerologWriter.New(baseWriter, loggerService.nrApp)
			writer = nrWriter
		} else {
			writer = baseWriter
		}
	} else {
		consoleWriter := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: "2006-01-02 15:04:05"}
		writer = consoleWriter
	}

	logger := zerolog.New(writer).
		Level(logLevel).
		With().
		Timestamp().
		Str("service", cfg.ServiceName).
		Str("environment", cfg.Environment).
		Logger()

	if !cfg.IsProduction() {
		logger = logger.With().Stack().Logger()
	}

	return logger
}
