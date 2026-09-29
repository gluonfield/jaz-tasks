import { App, type McpUiHostContext, PostMessageTransport, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { applyTheme } from './theme'

// The Jaz Tasks MCP App view, connected to the host that embeds the
// ui://jaz-tasks/app resource.
export const app = new App({ name: 'Jaz Tasks', version: '0.1.0' }, { availableDisplayModes: ['fullscreen'] })

// Hosts, Jaz included, theme apps with the spec's standard variables, which
// the stylesheet's tokens use as fallbacks (see THEMING.md).
export function applyHostContext(context: McpUiHostContext | undefined) {
  if (context?.theme) {
    applyDocumentTheme(context.theme)
    applyTheme({ scheme: context.theme })
  }
  if (context?.styles?.variables) {
    applyHostStyleVariables(context.styles.variables)
  }
}

export async function connect() {
  app.onhostcontextchanged = applyHostContext
  await app.connect(new PostMessageTransport(window.parent, window.parent))
  applyHostContext(app.getHostContext())
}

// graphql runs a document through the server's app-only graphql tool.
export async function graphql<T>(query: string, variables?: Record<string, unknown>) {
  const result = await app.callServerTool({ name: 'graphql', arguments: { query, variables: variables ?? {} } })
  if (result.isError) {
    const text = result.content.find((c) => c.type === 'text')
    throw new Error(text && 'text' in text ? text.text : 'graphql tool failed')
  }
  return result.structuredContent as { data?: T; errors?: { message: string }[] }
}
