package postgres

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	authdb "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/auth"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	pool *pgxpool.Pool
	q    *db.Queries
	auth *authdb.Queries
}

// Open connects and migrates to the latest schema.
func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool, q: db.New(pool), auth: authdb.New(pool)}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	dir, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, dir, goose.WithDisableGlobalRegistry(true))
	if err != nil {
		return fmt.Errorf("create migration provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

func (s *Store) tx(ctx context.Context, fn func(q *db.Queries) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return fn(s.q.WithTx(tx))
	})
}

func one[R, T any](conv func(R) T) func(R, error) (T, error) {
	return func(row R, err error) (T, error) {
		if err != nil {
			var zero T
			return zero, mapError(err)
		}
		return conv(row), nil
	}
}

func many[R, T any](conv func(R) T) func([]R, error) ([]T, error) {
	return func(rows []R, err error) ([]T, error) {
		if err != nil {
			return nil, mapError(err)
		}
		out := make([]T, len(rows))
		for i, row := range rows {
			out[i] = conv(row)
		}
		return out, nil
	}
}

func affected(n int64, err error) error {
	if err != nil {
		return mapError(err)
	}
	if n == 0 {
		return storage.ErrNotFound
	}
	return nil
}

func mapError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return storage.ErrNotFound
	}
	var pgErr *pgconn.PgError
	switch {
	case !errors.As(err, &pgErr):
		return err
	case pgErr.Code == "23505":
		return fmt.Errorf("%w: %s", storage.ErrConflict, pgErr.ConstraintName)
	case pgErr.Code == "22P02":
		// A malformed id, such as a UUID column given "abc", names nothing.
		return storage.ErrNotFound
	}
	return fmt.Errorf("%w: %w", storage.ErrUnexpected, err)
}
