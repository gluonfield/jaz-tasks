// The web app authenticates with the server's session cookie. An embedding
// host (Jaz) that cannot share that cookie hands the app an OAuth access
// token instead; it lives only in memory.
let hostToken: string | null = null
const listeners = new Set<() => void>()

export function getHostToken() {
  return hostToken
}

export function setHostToken(token: string) {
  hostToken = token
  listeners.forEach((listener) => listener())
}

export function onHostToken(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loginURL() {
  return `/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
}

export async function signOut() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  window.location.assign('/login')
}
