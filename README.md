# Jaz Tasks

A self-hosted, Linear-like issue tracker. One Go server exposes the task API for humans (a web UI) and for AI agents (a Linear-compatible GraphQL API and an MCP endpoint), backed by Postgres.

## Run it

```sh
docker compose up
```

This starts Postgres (host port 55432) and the server on http://localhost:7400, which serves both the API and the web app. Sign-in needs an OpenID Connect provider: copy `.env.example` to `.env` and set the `OIDC_*` values (Google setup below) first. The first person to sign in gets a workspace of their own.

## Authentication

- **People** sign in with OpenID Connect (Google first, but any provider: Microsoft, Okta, Keycloak, Cognito). The server keeps a session in Postgres behind an HttpOnly, SameSite=Lax cookie. Anyone with a verified email may sign up unless an allowlist is set; each new person gets a workspace of their own with a first team and Linear's default workflow, and joins other workspaces only when an admin invites their email (Settings > Members). People in several workspaces switch between them from the workspace menu.
- **Tenant isolation**: every query, resolver, MCP tool and token is scoped to one workspace; tests attack another tenant by UUID and by colliding identifiers such as ENG-1 through GraphQL and MCP.
- **Agents, MCP clients and Jaz** use OAuth 2.1: Jaz Tasks is its own authorization server with protected-resource metadata (RFC 9728, advertised in `WWW-Authenticate` on every 401 from `/graphql` and `/mcp`), authorization-server metadata (RFC 8414), dynamic client registration (RFC 7591), authorization code with PKCE S256, refresh token rotation with reuse detection, and revocation (RFC 7009). Tokens are opaque and stored hashed. The same access token works for `/graphql` and `/mcp`.
- **Scripts** can use personal API keys, created and revoked in Settings, sent like Linear's in a raw `Authorization` header. `docker compose exec server /app/server apikey <email>` mints one from the command line.
- **Deployments** can start with an account and its key, so clients such as Jaz work without anyone signing in: `OWNER_EMAIL` provisions that account on first start, and `OWNER_API_KEY` registers a key for it on every start. Give the client the same key as its bearer token. The person's first sign-in with that email takes the account over.

Configuration (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PUBLIC_URL` | Base URL of the deployment; source of the OIDC redirect URI (`PUBLIC_URL/auth/callback`), OAuth issuer, metadata URLs and cookie domain |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | OpenID Connect provider; keys come from its discovery document |
| `ALLOWED_EMAIL_DOMAINS`, `ALLOWED_EMAILS` | Optional restriction on who may sign in; empty admits every verified email. `email_verified` is always required |
| `OWNER_EMAIL`, `OWNER_API_KEY` | Optional account and API key provisioned at startup; the key is at least 32 random characters (`openssl rand -hex 32`), and replacing it retires the previous one |
| `DATABASE_URL`, `ADDR`, `WEB_DIR`, `LOG_LEVEL` | Server basics |

**Google:** in Google Cloud Console, APIs & Services > Credentials, create an OAuth client ID of type *Web application* and add `<PUBLIC_URL>/auth/callback` as an authorized redirect URI. Then set:

```sh
PUBLIC_URL=https://tasks.example.com
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=1234-abc.apps.googleusercontent.com
OIDC_CLIENT_SECRET=GOCSPX-...
ALLOWED_EMAIL_DOMAINS=example.com
```

**AWS Cognito:** create an app client with a secret, enable the authorization code grant with the `openid`, `email` and `profile` scopes, and add `<PUBLIC_URL>/auth/callback` as a callback URL:

```sh
OIDC_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEf123
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

## API

`POST /graphql` implements the subset of [Linear's GraphQL schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) that existing Linear clients use, with the same names and shapes: `issues`, `issue`, `searchIssues`, `issueCreate`, `issueUpdate`, `issueBatchCreate`, `issueArchive`, `issueDelete`, `teams`, `workflowStates`, `users`, `viewer`, `projects`, `cycles`, `issueLabels`, `commentCreate`, connection shapes with `nodes`/`pageInfo`, identifiers like `ENG-123`, Linear's filter inputs and error format. The full supported surface is `backend/internal/httpapi/gql/schema.graphqls`; anything else fails validation.

Authenticate with an OAuth access token (`Authorization: Bearer <token>`) or, like Linear, a personal API key (`Authorization: <key>`).

```sh
curl -s localhost:7400/graphql -H "Authorization: $KEY" -H 'Content-Type: application/json' \
  -d '{"query":"{ issues(filter: { state: { type: { eq: \"started\" } } }) { nodes { identifier title assignee { name } } } }"}'
```

Compatibility is pinned by `backend/internal/httpapi/gql/testdata/linear-cli`: the exact documents [linear-cli](https://github.com/gluonfield/linear-cli) sends, run against the server in `go test`.

## MCP

`/mcp` is a Streamable HTTP MCP server for agents, built on the same service layer as the API. MCP clients that support OAuth discover the authorization server from the 401 and walk you through sign-in and consent; others can send an API key as `Authorization: Bearer <key>`. Tools take names rather than ids (teams by key or name, people by name or email, `me`, `none` to clear):

| Tool | Does |
| --- | --- |
| `list_teams` | teams with keys, workflow states and usable labels |
| `list_users`, `list_projects` | people and projects to refer to |
| `list_issues` | filter by team, state or state type, assignee, project, label, priority, full-text query |
| `get_issue` | description, sub-issues and comments |
| `create_issue`, `update_issue` | every property, including moving teams and clearing fields |
| `add_comment` | markdown comment as the key's user |
| `show_tasks` | open the MCP App at a team, issue or section |
| `graphql` | the GraphQL API, for the MCP App only (`_meta.ui.visibility: ["app"]`) |

```sh
claude mcp add --transport http jaz-tasks http://localhost:7400/mcp
```

The endpoint is also an [MCP App](https://github.com/modelcontextprotocol/ext-apps): the resource `ui://jaz-tasks/app` is the whole web app as one self-contained HTML document (built by `bun run build` in `frontend`, embedded in the binary), which hosts such as Jaz render in a sandboxed frame. It loads data through the app-only `graphql` tool and takes its theme from the host; `show_tasks` opens it at a team, issue or section. See [frontend/THEMING.md](frontend/THEMING.md).

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
  internal/auth         sessions, OIDC sign-in, OAuth 2.1 grants, API keys
  internal/workspaces   sign-up policy, a workspace per new person, invites, switching
  internal/httpapi/authapi  sign-in, OAuth endpoints and metadata, settings endpoints
  internal/seed         demo workspace
  internal/storage      storage contracts; postgres/ holds migrations, sqlc queries and generated code
frontend/
  src/routes            TanStack file routes
  src/components        views, pickers, dialogs; ui/ holds shadcn primitives
  src/lib               GraphQL client, queries, theme bridge, shared types
```
