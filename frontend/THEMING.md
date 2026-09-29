# Theming

Every color, radius, font and shadow in the web app comes from CSS custom properties on `:root`. The names and meanings match the Jaz desktop app (`jaz/frontend/src/renderer/src/styles/globals.css`), so a host can pass its own tokens straight through. The defaults in `src/styles.css` follow Linear's palette; `:root.dark` holds the dark defaults.

## Tokens

| Token | Meaning |
| --- | --- |
| `--color-bg` | Main content: lists, boards, the issue page |
| `--color-panel` | Window chrome: the sidebar and the page behind the content card |
| `--color-surface` | Raised fills: group headers, board columns, code |
| `--color-surface-2` | Deeper fills |
| `--color-raised` | Menus, dialogs and cards; derived: `--color-bg` in light, `--color-surface` in dark |
| `--color-list-hover`, `--color-list-active` | Row hover and selection washes |
| `--color-ink`, `--color-ink-2`, `--color-ink-3` | Primary, secondary and tertiary text |
| `--color-border` | Hairlines |
| `--color-primary`, `--color-primary-strong`, `--color-primary-soft`, `--color-on-primary` | Accent for selection, focus and primary actions, and text on it |
| `--color-selection` | Text selection |
| `--color-accent`, `--color-accent-soft` | Warm counterpoint; the urgent priority glyph |
| `--color-running`, `--color-ok`, `--color-danger`, `--color-danger-soft` | Due soon, success, overdue and errors |
| `--color-scrim` | Dialog backdrop |
| `--color-avatar-1` ... `--color-avatar-6`, `--color-avatar-ink` | Avatar backgrounds and initials |
| `--font-sans`, `--font-mono` | Type families (they read `--jaz-ui-font` / `--jaz-mono-font` first) |
| `--radius-control`, `--radius-card` | Corner radii for controls and cards |
| `--shadow-raised` | Shadow for menus, dialogs and dragged cards |

Workflow state, label and project colors are workspace data and are drawn as stored.

## Overriding from a host

A host can use any of these; later ones win.

1. **Stylesheet.** Set variables on `:root` (and `:root.dark`) in a stylesheet injected into the page.

2. **`?theme=` URL parameter.** Either a scheme, `?theme=dark` / `?theme=light`, or base64url-encoded JSON of the same payload the message carries:

   ```js
   const payload = { scheme: 'dark', vars: { '--color-bg': 'oklch(0.195 0.005 264)' } }
   const theme = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
   iframe.src = `https://tasks.example.com/?theme=${theme}`
   ```

3. **`postMessage`.** When embedded, the app posts `{ type: 'jaz:ready' }` to its parent once it can receive a theme. Reply, and repeat whenever the host theme changes:

   ```js
   window.addEventListener('message', (event) => {
     if (event.source === iframe.contentWindow && event.data?.type === 'jaz:ready') {
       iframe.contentWindow.postMessage(
         { type: 'jaz:theme', scheme: 'dark', vars: { '--color-bg': '#151618', '--color-primary': '#7480ea' } },
         '*',
       )
     }
   })
   ```

   `scheme` toggles `:root.dark` and overrides the user's light/dark/system choice until they pick one again. Only messages from `window.parent` are read.

Values are applied with `style.setProperty` on `:root`. Only names matching `--[a-zA-Z0-9-]+` are accepted and values containing `url(` or `expression(` are dropped, so a host can restyle the app but not make it load resources.

## Jaz

Jaz can send its computed token values for the active scheme, for example every `--color-*`, `--radius-*`, `--font-*` and `--shadow-raised` declared in its `@theme` block and `:root:where(.dark)`. Values may reference each other (`color-mix(in oklab, var(--color-surface) 45%, var(--color-bg))`) because they resolve on the same `:root`.
