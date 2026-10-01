# Shared Jaz UI

`@jaz/ui` is the UI source shared by Tasks and CRM. Both apps pin the same
Git commit of this repository. Import actions from `@jaz/ui/button`.

Buttons use `variant="secondary"` (default), `primary`, `ghost` or `danger`.
Sizes are `default` (28px), `sm` (24px), `lg` (32px), `icon` (28px square)
and `icon-sm` (24px square). Actions default to `type="button"`; forms
explicitly use `type="submit"`. Keep style decisions here; callers set layout.

Consumers provide React 19, tailwind-merge 3 and Jaz semantic theme tokens.
Tailwind must scan `@source "../node_modules/@jaz/ui/ui"` from `src/styles.css`.
The apps' normal typecheck, lint and web/MCP builds verify the shared source.
