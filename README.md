# Jaz Tasks

A self-hosted, Linear-like issue tracker. One Go server exposes the task API for humans (a web UI) and for AI agents (a Linear-compatible GraphQL API and an MCP endpoint), backed by Postgres.

## Run it

```sh
docker compose up
```

This starts Postgres (host port 55432) and the server on http://localhost:7400, which serves both the API and the web app. On first start the server seeds a demo workspace ("Jaz", teams ENG and DES, labels, projects, cycles, issues) and logs an API key:

```
INFO seeded demo workspace api_key=jt_api_...
```

Set `SEED_API_KEY` in `.env` (see `.env.example`) to pin the key before the first start. Lost the key? Mint another for any user:

```sh
docker compose exec server /app/server apikey mira@jaz.local
```

Open http://localhost:7400 and paste the key to sign in.

## API

`POST /graphql` implements the subset of [Linear's GraphQL schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) that existing Linear clients use, with the same names and shapes: `issues`, `issue`, `searchIssues`, `issueCreate`, `issueUpdate`, `issueBatchCreate`, `issueArchive`, `issueDelete`, `teams`, `workflowStates`, `users`, `viewer`, `projects`, `cycles`, `issueLabels`, `commentCreate`, connection shapes with `nodes`/`pageInfo`, identifiers like `ENG-123`, Linear's filter inputs and error format. The full supported surface is `backend/internal/httpapi/gql/schema.graphqls`; anything else fails validation.

Authenticate like Linear: `Authorization: <key>` or `Authorization: Bearer <key>`.

```sh
curl -s localhost:7400/graphql -H "Authorization: $KEY" -H 'Content-Type: application/json' \
  -d '{"query":"{ issues(filter: { state: { type: { eq: \"started\" } } }) { nodes { identifier title assignee { name } } } }"}'
```

Compatibility is pinned by `backend/internal/httpapi/gql/testdata/linear-cli`: the exact documents [linear-cli](https://github.com/gluonfield/linear-cli) sends, run against the server in `go test`.

## MCP

`/mcp` is a Streamable HTTP MCP server for agents, built on the same service layer as the API. Authenticate with `Authorization: Bearer <key>`. Tools take names rather than ids (teams by key or name, people by name or email, `me`, `none` to clear):

| Tool | Does |
| --- | --- |
| `list_teams` | teams with keys, workflow states and usable labels |
| `list_users`, `list_projects` | people and projects to refer to |
| `list_issues` | filter by team, state or state type, assignee, project, label, priority, full-text query |
| `get_issue` | description, sub-issues and comments |
| `create_issue`, `update_issue` | every property, including moving teams and clearing fields |
| `add_comment` | markdown comment as the key's user |

```sh
claude mcp add --transport http jaz-tasks http://localhost:7400/mcp --header "Authorization: Bearer $KEY"
```

## Web app

A Linear-style UI built with TanStack Start (SPA mode), TanStack Query, Tailwind v4 and shadcn/ui. It talks to the server only through `/graphql`: list and board views grouped by status, issue pages with activity and comments, inline property pickers, a create dialog (`C`), a command palette (`⌘K`), optimistic updates, and light and dark themes.

Keyboard: `C` create, `⌘K` or `/` command palette, `J`/`K` move, `Enter` open, `S` status, `P` priority, `A` assignee, `L` labels, `E` estimate, `Shift+D` due date, `⌘B` list/board, `G` then `I`/`M`/`P`/`V` to go to Inbox, My issues, Projects, Views, `Esc` back.

The app can be embedded and themed by a host such as Jaz: see [frontend/THEMING.md](frontend/THEMING.md).

## Develop

Requirements: Go 1.26, Docker, [sqlc](https://sqlc.dev), [Bun](https://bun.sh).

```sh
docker compose up -d postgres
cd backend
go run ./cmd/server            # API on :7400, seeds on first run
go test ./...                  # needs the compose Postgres (or TEST_DATABASE_URL)
sqlc generate                  # after editing queries or migrations
(cd internal/httpapi/gql && go tool gqlgen generate)   # after editing the schema
```

```sh
cd frontend
bun install
bun run dev                    # http://localhost:7401, proxies /graphql to :7400
bun run check                  # typecheck, lint, build
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
frontend/
  src/routes            TanStack file routes
  src/components        views, pickers, dialogs; ui/ holds shadcn primitives
  src/lib               GraphQL client, queries, theme bridge, shared types
```
