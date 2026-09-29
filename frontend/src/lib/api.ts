import { getHostToken, loginURL } from './auth'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

// gql posts to the Linear-compatible endpoint with the session cookie, or a
// host-provided token when embedded.
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = getHostToken()
  const res = await fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'jaz:auth-required' }, '*')
    } else {
      window.location.assign(loginURL())
    }
    throw new ApiError('Not signed in', 401)
  }
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse<T>
  if (body.errors?.length) {
    throw new ApiError(body.errors[0].message, res.status)
  }
  if (!res.ok || !body.data) {
    throw new ApiError(`Request failed (${res.status})`, res.status)
  }
  return body.data
}

// rest calls the session-only settings endpoints.
export async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
