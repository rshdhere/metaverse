package database

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

type Database struct {
	Pool *pgxpool.Pool
	Log  *zerolog.Logger
}
