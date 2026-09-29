const storageKey = 'jaz-tasks:api-key'

export function getApiKey(): string {
  return localStorage.getItem(storageKey) ?? ''
}

export function setApiKey(key: string) {
  localStorage.setItem(storageKey, key.trim())
}

export function clearApiKey() {
  localStorage.removeItem(storageKey)
}
