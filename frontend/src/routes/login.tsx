import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { gql } from '@/lib/api'
import { setApiKey } from '@/lib/auth'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex min-h-full items-center justify-center bg-panel p-6">
      <form
        className="w-full max-w-[340px] animate-rise"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setApiKey(key)
          try {
            await gql('{ viewer { id } }')
            navigate({ to: '/' })
          } catch {
            setError('That key was not accepted.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="mx-auto mb-6 flex size-10 items-center justify-center rounded-[10px] bg-primary text-[18px] font-semibold text-on-primary shadow-sm">
          J
        </div>
        <h1 className="text-center text-[17px] font-semibold text-ink">Sign in to Jaz Tasks</h1>
        <p className="mb-6 mt-1.5 text-center text-[13px] text-ink-3">Paste an API key. The server prints one on first start.</p>
        <input
          autoFocus
          value={key}
          onChange={(e) => {
            setKey(e.target.value)
            setError('')
          }}
          placeholder="jt_api_..."
          className="h-9 w-full rounded-[var(--radius-control)] border border-border bg-bg px-3 font-mono text-[13px] text-ink outline-none transition-shadow placeholder:text-ink-3 focus:border-primary focus:ring-3 focus:ring-ring/30"
        />
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        <Button type="submit" disabled={!key.trim() || busy} className="mt-3 h-9 w-full">
          Continue
        </Button>
      </form>
    </div>
  )
}
