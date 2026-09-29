import { loginURL } from './auth'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

// transport replaces HTTP when the app runs as an MCP App, where documents
// travel through the server's graphql tool via the host.
let transport: (<T>(query: string, variables?: Record<string, unknown>) => Promise<GraphQLResponse<T>>) | null = null

export function setTransport(next: typeof transport) {
  transport = next
}

// embedded reports whether the app runs as an MCP App, without a session.
export function embedded() {
  return transport !== null
}

// gql posts to the Linear-compatible endpoint with the session cookie.
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (transport) {
    return unwrap(await transport<T>(query, variables), 200)
  }
  const res = await fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) {
    window.location.assign(loginURL())
    throw new ApiError('Not signed in', 401)
  }
  return unwrap((await res.json().catch(() => ({}))) as GraphQLResponse<T>, res.status)
}

function unwrap<T>(body: GraphQLResponse<T>, status: number): T {
  if (body.errors?.length) {
    throw new ApiError(body.errors[0].message, status)
  }
  if (!body.data) {
    throw new ApiError(`Request failed (${status})`, status)
  }
  return body.data
}

// rest calls the session-only account endpoints, which accept only JSON.
export async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (embedded()) {
    throw new ApiError('Account settings are available in the Jaz Tasks web app', 401)
  }
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  if (res.status === 401) {
    window.location.assign(loginURL())
  }
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(error.error ?? `Request failed (${res.status})`, res.status)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
