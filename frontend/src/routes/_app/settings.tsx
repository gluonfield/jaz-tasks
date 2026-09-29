import { createFileRoute } from '@tanstack/react-router'
import { Check, Copy, KeyRound, Monitor, Moon, Plug, Settings as SettingsIcon, Sun } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/icons'
import { useAPIKeys, useCreateAPIKey, useDeleteAPIKey, useGrants, useRevokeGrant } from '@/lib/account'
import { signOut } from '@/lib/auth'
import { formatDate, timeAgo } from '@/lib/issues'
import { useCatalog } from '@/lib/queries'
import { type SchemePreference, schemePreference, setSchemePreference, useScheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/settings')({ component: Settings })

function Settings() {
  const { data: catalog } = useCatalog()
  const viewer = catalog?.viewer
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
        <SettingsIcon className="size-4 text-ink-2" /> Settings
      </header>
      <div className="scrollbar-quiet flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] animate-rise px-8 pb-24 pt-10">
          <Section title="Account">
            <Row>
              <Avatar user={viewer} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{viewer?.name}</p>
                <p className="text-[12.5px] text-ink-3">{viewer?.email}</p>
              </div>
              <Button onClick={() => signOut()}>Sign out</Button>
            </Row>
          </Section>
          <Appearance />
          <APIKeys />
          <Applications />
        </div>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] text-ink-3">{description}</p>}
      <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-border bg-raised">{children}</div>
    </section>
  )
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-14 items-center gap-3 border-b border-border/70 px-4 py-2.5 text-[13px] last:border-b-0', className)}>{children}</div>
}

function Button({ children, onClick, primary, disabled }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-7 shrink-0 rounded-[var(--radius-control)] border px-2.5 text-[12.5px] font-medium outline-none transition-colors disabled:opacity-50',
        primary ? 'border-primary bg-primary text-on-primary hover:bg-primary-strong' : 'border-border text-ink hover:bg-list-hover',
      )}
    >
      {children}
    </button>
  )
}

function Appearance() {
  useScheme()
  const current = schemePreference()
  const options: { value: SchemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
    { value: 'system', label: 'System', icon: <Monitor className="size-3.5" /> },
  ]
  return (
    <Section title="Appearance">
      <Row>
        <span className="flex-1 text-ink">Theme</span>
        <div className="flex gap-1 rounded-[var(--radius-control)] bg-list-hover p-0.5">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => setSchemePreference(o.value)}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-[12.5px] font-medium outline-none transition-colors',
                current === o.value ? 'bg-raised text-ink shadow-xs' : 'text-ink-2 hover:text-ink',
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </Row>
    </Section>
  )
}

function APIKeys() {
  const { data: keys = [] } = useAPIKeys()
  const create = useCreateAPIKey()
  const remove = useDeleteAPIKey()
  const [label, setLabel] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  return (
    <Section
      title="Personal API keys"
      description="For scripts and CLIs. Send a key in the Authorization header, as with Linear. Agents should connect over OAuth instead."
    >
      <form
        className="flex items-center gap-2 border-b border-border/70 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(label, {
            onSuccess: ({ key }) => {
              setCreated(key)
              setCopied(false)
              setLabel('')
            },
            onError: (error) => toast.error(error.message),
          })
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key label, e.g. linear-cli"
          className="h-7 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-primary"
        />
        <Button primary disabled={!label.trim() || create.isPending}>
          Create key
        </Button>
      </form>
      {created && (
        <div className="flex items-center gap-2 border-b border-border/70 bg-primary-soft px-4 py-3">
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{created}</code>
          <button
            aria-label="Copy key"
            onClick={() => navigator.clipboard.writeText(created).then(() => setCopied(true))}
            className="flex size-7 items-center justify-center rounded-[5px] text-ink-2 outline-none hover:bg-list-hover"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <span className="text-[12px] text-ink-3">Shown once</span>
        </div>
      )}
      {keys.map((key) => (
        <Row key={key.id}>
          <KeyRound className="size-4 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{key.label}</p>
            <p className="text-[12px] text-ink-3">
              <span className="font-mono">{key.hint}</span> · Created {formatDate(key.createdAt)}
            </p>
          </div>
          <Button onClick={() => remove.mutate(key.id)}>Revoke</Button>
        </Row>
      ))}
      {!keys.length && <Row className="justify-center text-ink-3">No API keys yet</Row>}
    </Section>
  )
}

function Applications() {
  const { data: grants = [] } = useGrants()
  const revoke = useRevokeGrant()
  return (
    <Section title="Authorized applications" description="Agents and apps you connected over OAuth, such as MCP clients and Jaz.">
      {grants.map((grant) => (
        <Row key={grant.id}>
          <Plug className="size-4 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{grant.clientName}</p>
            <p className="text-[12px] text-ink-3">
              Authorized {formatDate(grant.createdAt)} · Last active {timeAgo(grant.lastUsedAt)}
            </p>
          </div>
          <Button onClick={() => revoke.mutate(grant.id)}>Revoke</Button>
        </Row>
      ))}
      {!grants.length && <Row className="justify-center text-ink-3">No applications connected</Row>}
    </Section>
  )
}
