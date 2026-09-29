import { clearApiKey, getApiKey } from './auth'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] }

// gql posts to the Linear-compatible endpoint with the stored API key.
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getApiKey() },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse<T>
  if (res.status === 401) {
    clearApiKey()
    window.location.assign('/login')
  }
  if (body.errors?.length) {
    throw new ApiError(body.errors[0].message, res.status)
  }
  if (!res.ok || !body.data) {
    throw new ApiError(`Request failed (${res.status})`, res.status)
  }
  return body.data
}
