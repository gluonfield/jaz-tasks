# Origin response compression

- [x] Compress Tasks responses in Go before they leave Railway, preserving negotiation and streaming MCP.
- [x] Share the standard-library gzip implementation with CRM through `jaz-tasks/httpx`.
- [x] Verify real MCP app downloads, identity, conditional/range requests and streaming delivery.
- [x] Run backend, frontend, shared-auth and middleware checks and review the implementation.
- [ ] Commit/push and verify production (deployment outcome recorded in session memory).

The real MCP app response shrank from 1,523,908 to 561,444 bytes (63.2%). The production-stack regression fails with compression disabled. Compression changes outbound bytes, not request frequency or RAM usage. Brotli would require a separately approved dependency.
