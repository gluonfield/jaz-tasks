# Shared sign-in

Go 1.26 module for Firebase and OpenID Connect browser sign-in. It produces
verified identities; consumers own accounts, workspace permissions and sessions.

Use `ConfigFromEnv(publicURL)`, then `NewHandler(config, appName, cookieName,
finish)`. Mount the handler at `/login` and `/auth/`. The `finish` callback maps
the identity to an account, sets the application's session cookie and returns
whether sign-in succeeded.

`AUTH_PROVIDER=oidc` is the default. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and
`OIDC_CLIENT_SECRET`; register `PUBLIC_URL/auth/callback` with the provider.

For Firebase, set `AUTH_PROVIDER=firebase` and `FIREBASE_CONFIG` to the web
configuration JSON containing `projectId`, `apiKey`, `authDomain` and `appId`.
Enable Google sign-in and authorise each app's domain in the Firebase project.
The browser uses Firebase JS SDK 12.19.0; Go verifies Firebase signatures with
the existing OIDC library and Google's public keys. No service account is needed.
This currently supports the project's default pool and Google browser sign-in.

Firebase ID tokens must carry a verified, recent sign-in to the configured
project. Linked Google subjects are retained for explicit migration of existing
memberships. Consumers must validate the email and access policy before linking.
Local sessions have the consumer's lifetime and revocation policy; Firebase
account changes do not automatically revoke sessions already issued by an app.

Run `go test ./...` and `go vet ./...`. Tasks and CRM also exercise the module
through their real OIDC, workspace and MCP authentication suites.
