package gql

import (
	"fmt"
	"io"
	"strconv"
	"time"

	"github.com/99designs/gqlgen/graphql"
)

const timelessLayout = "2006-01-02"

// MarshalTimelessDate writes Linear's TimelessDate, a calendar date without time.
func MarshalTimelessDate(t time.Time) graphql.Marshaler {
	return graphql.WriterFunc(func(w io.Writer) {
		_, _ = io.WriteString(w, strconv.Quote(t.Format(timelessLayout)))
	})
}

func UnmarshalTimelessDate(v any) (time.Time, error) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, fmt.Errorf("TimelessDate must be a YYYY-MM-DD string")
	}
	return time.Parse(timelessLayout, s)
}

// MarshalDateTime writes UTC with millisecond precision, as Linear does.
func MarshalDateTime(t time.Time) graphql.Marshaler {
	return graphql.WriterFunc(func(w io.Writer) {
		_, _ = io.WriteString(w, strconv.Quote(t.UTC().Format("2006-01-02T15:04:05.000Z")))
	})
}

func UnmarshalDateTime(v any) (time.Time, error) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, fmt.Errorf("DateTime must be an ISO 8601 string")
	}
	return time.Parse(time.RFC3339Nano, s)
}
