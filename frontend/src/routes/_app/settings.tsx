import { createFileRoute } from '@tanstack/react-router'
import { Check, Copy, KeyRound, Mail, Monitor, Moon, Plug, Settings as SettingsIcon, Sun, UserPlus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@jaz/ui/button'
import { inputClass } from '@/components/controls'
import { Avatar, TeamBadge } from '@/components/icons'
import { McpConnection } from '@/components/mcp-connection'
import { useAPIKeys, useCreateAPIKey, useDeleteAPIKey, useGrants, useRevokeGrant } from '@/lib/account'
import { embedded } from '@/lib/api'
import { signOut } from '@/lib/auth'
import { formatDate, timeAgo } from '@/lib/issues'
import { useCancelInvite, useCatalog, useInvite, useInvites, useRename } from '@/lib/queries'
import { type SchemePreference, schemePreference, setSchemePreference, useScheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/settings')({ component: Settings })

function Settings() {
  const { data: catalog } = useCatalog()
  const viewer = catalog?.viewer
  const session = !embedded()
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13px] font-medium text-ink">
        <SettingsIcon className="size-4 text-ink-2" /> Settings
      </header>
      <div className="scrollbar-quiet flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] animate-rise px-8 pb-24 pt-10">
          {session && (
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
          )}
          <Workspace />
          <Members />
          <Appearance />
          <Section id="mcp" title="MCP"><McpConnection /></Section>
          {session && <APIKeys />}
          {session && <Applications />}
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-[12.5px] text-ink-3">{description}</p>}
      <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-border bg-raised">{children}</div>
    </section>
  )
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-14 items-center gap-3 border-b border-border/70 px-4 py-2.5 text-[13px] last:border-b-0', className)}>{children}</div>
}

function Workspace() {
  const { data: catalog } = useCatalog()
  return (
    <>
      <Section title="Workspace">
        <Row>
          <span className="flex-1 text-ink">Name</span>
          <Name value={catalog?.organization.name ?? ''} disabled={!catalog?.viewer.admin} />
        </Row>
      </Section>
      <Section title="Teams">
        {catalog?.teams.map((team) => (
          <Row key={team.id}>
            <TeamBadge icon={team.icon} color={team.color} />
            <span className="flex-1 text-ink-3">{team.key}</span>
            <Name value={team.name} teamId={team.id} />
          </Row>
        ))}
      </Section>
    </>
  )
}

// Name saves a workspace or team name on blur or Enter; Escape reverts it.
function Name({ value, teamId, disabled }: { value: string; teamId?: string; disabled?: boolean }) {
  const rename = useRename()
  return (
    <input
      key={value}
      defaultValue={value}
      disabled={disabled}
      aria-label={teamId ? 'Team name' : 'Workspace name'}
      onBlur={(e) => {
        const name = e.currentTarget.value.trim()
        if (name && name !== value) {
          rename.mutate({ teamId, name }, { onError: (error) => toast.error(error.message) })
        } else {
          e.currentTarget.value = value
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.currentTarget.value = value
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.currentTarget.blur()
        }
      }}
      className={cn(inputClass, 'w-60')}
    />
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
          className={cn(inputClass, 'flex-1')}
        />
        <Button type="submit" variant="primary" disabled={!label.trim() || create.isPending}>
          Create key
        </Button>
      </form>
      {created && (
        <div className="flex items-center gap-2 border-b border-border/70 bg-primary-soft px-4 py-3">
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{created}</code>
          <Button
            aria-label="Copy key"
            onClick={() => navigator.clipboard.writeText(created).then(() => setCopied(true))}
            variant="ghost" size="icon"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
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

function Members() {
  const { data: catalog } = useCatalog()
  const { data: invites = [] } = useInvites()
  const invite = useInvite()
  const cancel = useCancelInvite()
  const [email, setEmail] = useState('')
  const admin = !!catalog?.viewer.admin
  // Typing a valid address offers it as the one option to invite; nothing is
  // emailed, the person joins when they next sign in with it.
  const typed = email.trim().toLowerCase()
  const known = catalog?.users.some((u) => u.email.toLowerCase() === typed)
    ? 'is already a member'
    : invites.some((i) => i.email === typed)
      ? 'is already invited'
      : null
  return (
    <Section
      id="members"
      title="Members"
      description="Invited people join when they next sign in with that email"
    >
      {admin && (
        <form
          className="border-b border-border/70 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (known || invite.isPending) {
              return
            }
            invite.mutate(typed, {
              onSuccess: (sent) => {
                toast(`Invited ${sent.email}`)
                setEmail('')
              },
              onError: (error) => toast.error(error.message),
            })
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite by email"
            className={cn(inputClass, 'w-full')}
          />
          {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed) && (
            <button
              type="submit"
              disabled={!!known}
              className="mt-1.5 flex h-8 w-full items-center gap-2 rounded-[var(--radius-control)] bg-list-active px-2.5 text-left text-[13px] text-ink outline-none disabled:bg-transparent disabled:text-ink-3"
            >
              <UserPlus className="size-3.5 shrink-0 text-ink-3" />
              {known ? (
                <span className="truncate">
                  {typed} {known}
                </span>
              ) : (
                <span className="truncate">
                  Invite <span className="font-medium">{typed}</span>
                </span>
              )}
            </button>
          )}
        </form>
      )}
      {catalog?.users.map((user) => (
        <Row key={user.id}>
          <Avatar user={user} size={24} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">
              {user.name}
              {user.isMe && <span className="ml-1.5 font-normal text-ink-3">(you)</span>}
            </p>
            <p className="truncate text-[12px] text-ink-3">{user.email}</p>
          </div>
          <span className="text-[12px] text-ink-3">{user.admin ? 'Admin' : 'Member'}</span>
        </Row>
      ))}
      {invites.map((pending) => (
        <Row key={pending.id}>
          <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-ink-3/60 text-ink-3">
            <Mail className="size-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-ink">{pending.email}</p>
            <p className="text-[12px] text-ink-3">Invited {formatDate(pending.createdAt)}</p>
          </div>
          {admin && <Button onClick={() => cancel.mutate(pending.id)}>Cancel</Button>}
        </Row>
      ))}
    </Section>
  )
}
