package logger

import (
	"github.com/newrelic/go-agent/v3/newrelic"
)

type LoggerService struct {
	nrApp *newrelic.Application
}
