import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { handleMarkdownShortcut } from './markdown-shortcuts'
import { isMac, matchesKey, shortcutIds, shortcuts, type ShortcutActions, type ShortcutId } from './shortcut-definitions'

function createRegistry() {
  const scopes = new Map<object, ShortcutActions>()
  const listeners = new Set<() => void>()
  let actions: ShortcutActions = {}
  const publish = () => {
    actions = Object.assign({}, ...scopes.values())
    listeners.forEach((listener) => listener())
  }
  return {
    get: () => actions,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (scope: object, value: ShortcutActions) => {
      scopes.set(scope, value)
      publish()
    },
    remove: (scope: object) => {
      scopes.delete(scope)
      publish()
    },
  }
}

const ShortcutContext = createContext<ReturnType<typeof createRegistry> | null>(null)

export function useShortcutActions(actions: ShortcutActions) {
  const registry = useContext(ShortcutContext)
  const [scope] = useState(() => ({}))
  useLayoutEffect(() => {
    registry?.set(scope, actions)
  }, [registry, scope, actions])
  useLayoutEffect(() => () => registry?.remove(scope), [registry, scope])
}

export function useAvailableShortcuts() {
  const registry = useContext(ShortcutContext)!
  return useSyncExternalStore(registry.subscribe, registry.get, registry.get)
}

export function isTyping(event: KeyboardEvent) {
  const target = event.target
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="textbox"]'))
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createRegistry)
  useEffect(() => {
    let pending: { prefix: string; fallback?: ShortcutId } | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(timer)
      pending = undefined
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        reset()
        return
      }
      if (handleMarkdownShortcut(event)) {
        reset()
        return
      }
      if (isTyping(event) || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]')) {
        reset()
        return
      }
      if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.closest('button, a, summary, [role="button"]')) {
        reset()
        return
      }
      const actions = registry.get()
      const available = shortcutIds.filter((id) => actions[id])
      if (pending) {
        const prefix = pending.prefix
        reset()
        const id = available.find((id) => shortcuts[id].keys.some((keys) => {
          const parts = keys.split(' ')
          return parts.length === 2 && parts[0] === prefix && matchesKey(event, parts[1], isMac())
        }))
        if (id) {
          event.preventDefault()
          actions[id]?.()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          return
        }
      }
      const single = available.find((id) => shortcuts[id].keys.some((keys) => !keys.includes(' ') && matchesKey(event, keys, isMac())))
      const sequence = available.flatMap((id) => shortcuts[id].keys).find((keys) => keys.includes(' ') && matchesKey(event, keys.split(' ')[0], isMac()))
      if (sequence) {
        event.preventDefault()
        const fallbackAction = single && actions[single]
        pending = { prefix: sequence.split(' ')[0], fallback: single }
        timer = setTimeout(() => {
          const fallback = pending?.fallback
          reset()
          if (fallback && registry.get()[fallback] === fallbackAction && !document.querySelector('[role="dialog"], [role="menu"]')) {
            registry.get()[fallback]?.()
          }
        }, 800)
      } else if (single) {
        event.preventDefault()
        actions[single]?.()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', reset)
    document.addEventListener('focusin', reset)
    document.addEventListener('pointerdown', reset)
    return () => {
      reset()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', reset)
      document.removeEventListener('focusin', reset)
      document.removeEventListener('pointerdown', reset)
    }
  }, [registry])
  return <ShortcutContext value={registry}>{children}</ShortcutContext>
}
