# Jaz Tasks

A self-hosted, Linear-like issue tracker. One Go server exposes the task API for humans (a web UI) and for AI agents (a Linear-compatible GraphQL API and an MCP endpoint), backed by Postgres.

## Run it

```sh
docker compose up
```

This starts Postgres (host port 55432) and the server on http://localhost:7400. On first start the server seeds a demo workspace ("Jaz", teams ENG and DES, labels, projects, cycles, issues) and logs an API key:

```
INFO seeded demo workspace api_key=jt_api_...
```

Set `SEED_API_KEY` in `.env` (see `.env.example`) to pin the key before the first start. Lost the key? Mint another for any user:

```sh
docker compose exec server /app/server apikey mira@jaz.local
```

## API

`POST /graphql` implements the subset of [Linear's GraphQL schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) that existing Linear clients use, with the same names and shapes: `issues`, `issue`, `searchIssues`, `issueCreate`, `issueUpdate`, `issueBatchCreate`, `issueArchive`, `issueDelete`, `teams`, `workflowStates`, `users`, `viewer`, `projects`, `cycles`, `issueLabels`, `commentCreate`, connection shapes with `nodes`/`pageInfo`, identifiers like `ENG-123`, Linear's filter inputs and error format. The full supported surface is `backend/internal/httpapi/gql/schema.graphqls`; anything else fails validation.

Authenticate like Linear: `Authorization: <key>` or `Authorization: Bearer <key>`.

```sh
curl -s localhost:7400/graphql -H "Authorization: $KEY" -H 'Content-Type: application/json' \
  -d '{"query":"{ issues(filter: { state: { type: { eq: \"started\" } } }) { nodes { identifier title assignee { name } } } }"}'
```

Compatibility is pinned by `backend/internal/httpapi/gql/testdata/linear-cli`: the exact documents [linear-cli](https://github.com/gluonfield/linear-cli) sends, run against the server in `go test`.

## Develop

Requirements: Go 1.26, Docker, [sqlc](https://sqlc.dev).

```sh
docker compose up -d postgres
cd backend
go run ./cmd/server            # API on :7400, seeds on first run
go test ./...                  # needs the compose Postgres (or TEST_DATABASE_URL)
sqlc generate                  # after editing queries or migrations
(cd internal/httpapi/gql && go tool gqlgen generate)   # after editing the schema
```

Server flags (each defaults to an env var): `--addr` (`ADDR`, `:7400`), `--database-url` (`DATABASE_URL`), `--public-url` (`PUBLIC_URL`), `--web-dir` (`WEB_DIR`).

## Layout

```
backend/
  cmd/server            entrypoint (serve, apikey)
  internal/app          Fx wiring and config
  internal/server       HTTP shell: routing, auth, CORS, web app
  internal/httpapi/gql  Linear-compatible GraphQL (gqlgen)
  internal/tracker      issue-tracking domain service
  internal/auth         API keys
  internal/seed         demo workspace
  internal/storage      storage contracts; postgres/ holds migrations, sqlc queries and generated code
```
