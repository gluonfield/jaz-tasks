# MCP display headers and chat buttons

- [x] Configure the MCP App per connection with `Tasks-View`, `Tasks-Columns` and `Tasks-Mode` headers.
- [x] Default views to list or board; show only the named workflow states as groups and board columns, in order.
- [x] `Tasks-Mode: minimal` drops the sidebar, tabs, display menu, issue menu, sub-issues, activity and secondary row properties; keyboard property shortcuts keep working.
- [x] Render `<jaz.newthread prompt:"..." />` in descriptions and comments as a button that asks Jaz to start a chat with the prompt.
- [x] Verify through a real MCP connection, review the code, commit and push.

The server reads the headers on resource reads and writes them into the app's root as `data-config`; an invalid value fails the read with the reason. The button calls Jaz's experimental `jaz/threads/create` request and is disabled in hosts that do not advertise `jaz/threads`. Prompts reach the button by index, so markdown inside a prompt stays literal and a hand-written `jaz-newthread:` link renders as an ordinary link. `/mcp` now allows the three headers in CORS preflights and exposes `Mcp-Session-Id` on every response, without which browser MCP clients could not keep a session.

Verification: backend and frontend checks; `TestAppDisplayHeaders` drives the headers through a real MCP client and fails when a header is ignored. A local host harness read the rebuilt app over MCP with each header set against seeded issues: minimal board and list with configured columns, the full app with a default board, light and dark themes, 390px width, a rejected `Tasks-View: grid`, malformed `jaz-newthread:` links and tags in code fences, and the button sending its exact prompt (URL, `*` and parentheses intact) or staying disabled without the capability. The Jaz side is in Jaz's `docs/requests-app-threads.md`.
