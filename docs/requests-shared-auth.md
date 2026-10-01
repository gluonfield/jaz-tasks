# Shared authentication request ledger

- [x] Share provider identities and browser sign-in across Tasks and CRM.
- [x] Support Firebase and configurable direct OIDC in both apps.
- [x] Preserve existing memberships when Google accounts move to Firebase.
- [x] Verify successful sign-in, rejection boundaries, sessions and MCP grants.
- [x] Commit and push verified work in both repositories.
- [x] Deploy both Railway apps with the supplied `jaz-production-72cc9` pool.
- [x] Verify production health, configured pool and browser sign-in.

Requested 2026-10-01. Details and validation are recorded in authentication.md.

Verified: full Go suites, build/vet, frontend checks, signed-token HTTP exchange,
CSRF/origin rejection and real Postgres membership migration. Negative controls
fail when signature verification or identity migration is disabled.
Both repositories are pushed and Railway deployments report SUCCESS.
Both apps expose the supplied Firebase pool; real Google browser sign-in and
authenticated MCP initialize/profile reads pass (14 Tasks tools, 30 CRM tools).
