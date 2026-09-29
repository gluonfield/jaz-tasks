import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'

type AuthConfig = { provider?: string }

export const Route = createFileRoute('/login')({
  validateSearch: (search): { return_to?: string; error?: string } => ({
    return_to: typeof search.return_to === 'string' ? search.return_to : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: Login,
})

function Login() {
  const { return_to: returnTo = '/', error } = Route.useSearch()
  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async (): Promise<AuthConfig> => (await fetch('/auth/config')).json(),
  })
  return (
    <div className="flex min-h-full items-center justify-center bg-panel p-6">
      <div className="w-full max-w-[320px] animate-rise text-center">
        <div className="mx-auto mb-6 flex size-10 items-center justify-center rounded-[10px] bg-primary text-[18px] font-semibold text-on-primary shadow-sm">
          J
        </div>
        <h1 className="text-[17px] font-semibold text-ink">Sign in to Jaz Tasks</h1>
        <p className="mb-7 mt-1.5 text-[13px] text-ink-3">Your team's issues, for people and agents.</p>
        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}
        {config?.provider && (
          <a
            href={`/auth/login?return_to=${encodeURIComponent(returnTo)}`}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-raised text-[13.5px] font-medium text-ink shadow-xs outline-none transition-colors hover:bg-list-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            {config.provider === 'Google' ? <GoogleMark /> : <KeyRound className="size-4 text-ink-2" />}
            Continue with {config.provider}
          </a>
        )}
        {config && !config.provider && (
          <p className="text-[12.5px] text-ink-3">Sign-in is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET on the server.</p>
        )}
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}
