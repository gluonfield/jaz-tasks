import { App, type McpUiHostContext, PostMessageTransport, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import './issue-card.css'

// The card hosts show inline when an agent creates an issue: the issue at a
// glance, opening in the Tasks app through a deep link.
const app = new App({ name: 'Jaz Tasks issue', version: '0.1.0' }, { availableDisplayModes: ['inline'] })

type Issue = { identifier: string; title: string; state: string; stateType: string }

// Deep links (OpenAI's MCP extensions) open the Tasks sidebar app, the
// show_tasks global entrypoint, at a page.
const deepLink = (path: string) => `codex://plugins/jaz-tasks/app/show_tasks?path=${encodeURIComponent(path)}`

const openIcon = '<svg class="open" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h6v6M11 3 3.5 10.5"/></svg>'

// statusIcon draws the app's workflow glyph for a state type (StatusIcon).
function statusIcon(type: string, color: string) {
  const cut = 'var(--color-background-tertiary, #f0f0f2)'
  const glyph =
    type === 'completed'
      ? `<circle cx="7" cy="7" r="6.5" fill="${color}"/><path d="M4.3 7.2 6.2 9l3.5-3.9" fill="none" stroke="${cut}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : type === 'canceled'
        ? `<circle cx="7" cy="7" r="6.5" fill="${color}"/><path d="m4.9 4.9 4.2 4.2m0-4.2L4.9 9.1" stroke="${cut}" stroke-width="1.5" stroke-linecap="round"/>`
        : `<circle cx="7" cy="7" r="5.75" fill="none" stroke="${color}" stroke-width="1.5"${type === 'backlog' ? ' stroke-dasharray="1.4 1.74"' : ''}/>` +
          (type === 'started' ? `<circle cx="7" cy="7" r="1.75" fill="none" stroke="${color}" stroke-width="3.5" stroke-dasharray="${Math.PI * 1.75} 100" transform="rotate(-90 7 7)"/>` : '')
  return `<svg viewBox="0 0 14 14" aria-hidden="true">${glyph}</svg>`
}

function render(issue: Issue, color: string) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'card'
  card.title = `${issue.state} · Open in Tasks`
  card.innerHTML = `${statusIcon(issue.stateType, color)}<span class="id"></span><span class="title"></span>${openIcon}`
  card.querySelector('.id')!.textContent = issue.identifier
  card.querySelector('.title')!.textContent = issue.title
  card.onclick = () => void app.openLink({ url: deepLink(`/issue/${issue.identifier}`) })
  document.body.replaceChildren(card)
}

function theme(context?: McpUiHostContext) {
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
}

app.addEventListener('hostcontextchanged', theme)
app.addEventListener('toolresult', ({ structuredContent, _meta }) => {
  const issue = structuredContent as Issue | undefined
  const color = _meta?.['jaz-tasks/stateColor']
  if (issue?.identifier) render(issue, typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color) ? color : 'currentColor')
})
void app.connect(new PostMessageTransport(window.parent, window.parent)).then(() => theme(app.getHostContext()))
