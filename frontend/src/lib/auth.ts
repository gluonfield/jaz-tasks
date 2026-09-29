export function loginURL() {
  return `/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
}

export async function signOut() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  window.location.assign('/login')
}
