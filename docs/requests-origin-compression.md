# Origin response compression

- [x] Compress Tasks responses in Go before they leave Railway, preserving negotiation and streaming MCP.
- [x] Share the standard-library gzip implementation with CRM through `jaz-tasks/httpx`.
- [x] Verify real MCP app downloads, identity, conditional/range requests and streaming delivery.
- [x] Run backend, frontend, shared-auth and middleware checks and review the implementation.
- [x] Commit/push and verify production: `032c9fb`, Railway deployment `ffd09f18-c945-4be9-adc2-68975c024daf` succeeded.

The real MCP app response shrank from 1,523,908 to 561,444 bytes (63.2%). The production-stack regression fails with compression disabled. Compression changes outbound bytes, not request frequency or RAM usage. Brotli would require a separately approved dependency.

Authenticated production MCP verification: 1,535,224 bytes with identity, 562,787 with gzip (63.3% smaller), identical decoded app. Shared middleware CI also passed.
