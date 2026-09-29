# Engineering Rules

- Use Go 1.26.
- Keep code and JSON minimal. Each line of code should fight for its existence; every field and line must earn its place.
- Prefer implementations that reduce total code over ones that add more. Adding lines is a cost to justify; a good fix often deletes code, collapses branches, or moves an invariant to the layer that already owns it.
- Write one statement per line; never join statements with semicolons.
- Trim strings at real input boundaries only: user input, config files, env vars, HTTP payloads, CLI args, and persisted loose text. Do not sprinkle `strings.TrimSpace` over internal constants, typed IDs, enum values, or values that have already crossed a validation boundary.
- When there's an opportunity for dramatic simplification or restructuring, bring it up. Favor moves that delete layers, unify shapes, collapse special cases, or make the design inevitable over incremental patches.
- Bug fixes should first look for deletion or correction of the underlying contract. A solution that only adds branches, flags, helpers, or UI glue is suspicious.
- Do not add code comments until they are genuinely needed to explain specific behavior the code itself cannot describe.
- Keep concrete implementations focused and interfaces small.
- Put behavior in the layer that owns the concept.
- Split files when a feature starts mixing transport, persistence, formatting, and UI concerns. Avoid pushing files toward 1k lines without a strong structural reason.
- Keep feature diffs scoped. Do not mix unrelated UI polish, dependency churn, or generated output into behavioral changes.
- Keep `main.go` files as command dispatch and process entrypoints only. Domain types, helpers, clients and request/response shapes belong in the package that owns that concept.
- Use Fx constructors directly in `fx.Provide`; avoid pass-through wrappers.
- Do not add defensive nil checks for required constructor-injected dependencies. If a required Fx service is missing, fail fast; model truly optional dependencies explicitly.
- Never commit secrets. Configuration comes from flags and env vars; document them in `.env.example`.
- Target deployments run the server on a VM and clients on user computers; never assume client-local file paths are visible to the server.
- Before handing off a completed feature or fix, run a code-review pass.
- Every test you add must be useful: it must run in the relevant verification path and either protect real behavior or clarify a tricky contract. Tests that need Postgres fail (not skip) when it is unavailable.

## Linear compatibility

- `/graphql` implements a subset of Linear's public schema (`packages/sdk/src/schema.graphql` in `linear/linear`). Type, field, argument and input names, nullability and error messages must match Linear. Anything absent from `schema.graphqls` is unsupported and must fail validation rather than being silently ignored or approximated.
- Do not bend the schema to accommodate a client bug; if a client sends a document Linear rejects, reject it too (see `TestLinearCLIOperationsLinearRejects`).
- Unknown values stay unknown: a nullable field we do not track (e.g. `User.lastSeen`) returns null, never a guess.
- `internal/httpapi/gql/testdata/linear-cli` holds the exact documents `gluonfield/linear-cli` sends. Keep them passing; add a fixture whenever a new client operation is supported.

## Backend architecture

- Imports point one way: `server` -> `httpapi/<feature>` -> `internal/<feature>` -> `storage` contracts. Feature packages must not import `server`, `httpapi`, or `storage/postgres`; the Postgres adapter must not import feature packages.
- `internal/server` is the HTTP process shell: routing, auth, CORS, health and the web app. Feature behavior does not live there.
- `internal/tracker` owns issue-tracking semantics: filters, validation, lifecycle timestamps, history, pagination. A `tracker.Scope` is one actor's request-scoped view that memoizes the small catalog entities (users, teams, states, labels, projects, cycles); create one per request or tool call.
- Transports (`httpapi/gql`, the MCP endpoint, future adapters) translate protocol shapes only. GraphQL types bind directly to `storage` records and `tracker` inputs/filters through `gqlgen.yml`; add resolver code only for derived or related fields.
- Services take the actor explicitly (via `Scope`); services never read HTTP headers.
- Keep multi-record writes atomic in storage methods. `UpdateIssue` locks the row and runs the service's mutation inside the transaction.

## Authentication

- `internal/auth` owns identity. People sign in with OIDC and hold a server-side session cookie; agents and apps get OAuth 2.1 tokens from our own authorization server; personal API keys are a secondary path for scripts. All three resolve to the same `auth.Actor`.
- Tokens, keys, codes and session ids are opaque random values; store only their SHA-256. Never log them.
- `PUBLIC_URL` is the single source for the OIDC redirect URI, the OAuth issuer, metadata URLs and the cookie domain. Do not add parallel settings.
- Every 401 from a protected resource carries `WWW-Authenticate: Bearer resource_metadata=...`. Keep `/mcp` on the go-sdk bearer middleware.
- Settings endpoints that mint or revoke credentials require a browser session, never a bearer token.
- Development login is only for a loopback `PUBLIC_URL` without OIDC; keep it impossible to enable elsewhere.

## Postgres and sqlc

- Migrations live in `backend/internal/storage/postgres/migrations` (goose, embedded, run at startup). Never edit a migration that has shipped; add a new one.
- Query SQL lives in `backend/internal/storage/postgres/queries/<feature>`; sqlc output goes to `backend/internal/storage/postgres/generated/<feature>` and is checked in. Handwritten `storage/postgres/*.go` files may open the pool, run migrations, manage transactions and map rows, but must not contain query SQL.
- `storage` records and inputs mirror the sqlc models and params field for field, so the adapter converts with a type conversion. A schema change fails to compile until the record follows; keep it that way instead of writing field-by-field mappers.
- Regenerate with `sqlc generate` (backend) and `go tool gqlgen generate` (in `internal/httpapi/gql`).

## Testing

- Test at the lowest boundary that protects behavior. Tracker tests run against a throwaway Postgres database (`postgrestest.New`) seeded with the demo workspace; GraphQL tests drive the real HTTP handler.
- Verification before every push: `go build ./... && go vet ./... && go test ./...` in `backend`, and `bun run check` (typecheck, lint, build) in `frontend`.

## Frontend

- The web app talks to the backend only through `/graphql`.
- Every color, radius, font and shadow comes from CSS custom properties that use Jaz's token names (`--color-bg`, `--color-ink`, `--radius-control`, ...) so the Jaz host can theme the app. See `frontend/THEMING.md`; never hardcode a color in a component.
- Shared hooks and lib code must not import component-owned types. Put cross-layer contracts in `lib`.
- Match Linear's UI: dense, calm, keyboard-first, 13px type.
