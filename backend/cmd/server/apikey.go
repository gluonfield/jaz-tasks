package main

import (
	"context"
	"fmt"

	"github.com/gluonfield/jaz-tasks/backend/internal/app"
)

func runAPIKey(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: apikey EMAIL [flags]")
	}
	email := args[0]
	cfg, err := app.ParseConfig(args[1:])
	if err != nil {
		return err
	}
	key, err := app.MintAPIKey(context.Background(), cfg, email)
	if err != nil {
		return err
	}
	fmt.Println(key)
	return nil
}
