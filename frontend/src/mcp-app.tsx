import { useEffect } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { setTransport } from './lib/api'
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { app, connect, graphql } from './lib/mcp-app'
import { routeTree } from './routeTree.gen'
import { Route as root } from './routes/__root'
import './styles.css'

// The MCP App renders the web app's routes inside a host's sandboxed,
// opaque-origin iframe: no document shell or login, in-memory history, data
// through the graphql tool, and external links opened by the host.
;(root.options as { shellComponent?: unknown }).shellComponent = undefined
setTransport(graphql)

const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
  context: { queryClient: new QueryClient({ defaultOptions: { queries: { retry: 1 } } }) },
})

function reportNavigation(replace: boolean, delta?: number) {
  if (!app.getHostCapabilities()?.experimental?.['jaz/navigation']) return
  const path = router.history.location.href
  void app.notification({ method: 'jaz/notifications/navigation', params: { path, replace, ...(delta && { delta }) } }).catch(console.error)
}

// Subscribe after RouterProvider mounts: the router treats history subscribers as its loading adapter.
function AppRouter() {
  useEffect(() => {
    reportNavigation(true)
    return router.history.subscribe(({ location, action }) => {
      const delta = action.type === 'BACK' ? -1 : action.type === 'FORWARD' ? 1 : action.type === 'GO' ? action.index : undefined
      const target = (app.getHostContext()?.['jaz/navigation'] as { path?: string } | undefined)?.path
      if (delta || location.href !== target) reportNavigation(action.type !== 'PUSH', delta)
    })
  }, [])
  return <RouterProvider router={router} />
}

// show_tasks passes a view: a team key, an issue identifier or a section.
app.ontoolinput = ({ arguments: args }) => {
  const view = typeof args?.view === 'string' ? args.view.trim() : ''
  const to = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(view)
    ? `/issue/${view.toUpperCase()}`
    : ['inbox', 'my-issues', 'projects', 'views'].includes(view)
      ? `/${view}`
      : view
        ? `/team/${view.toUpperCase()}/all`
        : '/'
  void router.navigate({ to }).then(() => reportNavigation(true))
}

// A host's deep link (OpenAI's MCP extensions) opens the app at a page, at
// start and whenever the host changes it.
function follow(context?: McpUiHostContext) {
  const path = (context?.['jaz/navigation'] as { path?: unknown } | undefined)?.path
  if (typeof path === 'string' && path.startsWith('/')) {
    if (router.history.location.href !== path) void router.navigate({ href: path, replace: true })
    return
  }
  const url = (context?.['openai/deepLink'] as { url?: unknown } | undefined)?.url
  if (typeof url === 'string' && url.startsWith('/')) router.navigate({ href: url })
}
app.addEventListener('hostcontextchanged', follow)

document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="http"]')
  if (link) {
    event.preventDefault()
    app.openLink({ url: link.href })
  }
})

connect().finally(() => {
  follow(app.getHostContext())
  createRoot(document.getElementById('root')!).render(<AppRouter />)
})
