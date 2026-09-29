import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { UserRoundCheck } from 'lucide-react'
import { useMemo } from 'react'
import { IssueView, Tab } from '@/components/issue-view'
import { useCatalog, useIssues } from '@/lib/queries'

type MyTab = 'assigned' | 'created'

export const Route = createFileRoute('/_app/my-issues')({
  validateSearch: (search): { tab?: MyTab } => ({ tab: search.tab === 'created' ? 'created' : undefined }),
  component: MyIssues,
})

function MyIssues() {
  const tab = Route.useSearch().tab ?? 'assigned'
  const navigate = useNavigate()
  const { data: catalog } = useCatalog()
  const { data: issues, isLoading } = useIssues()
  const me = catalog?.viewer.id
  const mine = useMemo(
    () => (issues ?? []).filter((i) => (tab === 'assigned' ? i.assigneeId === me : i.creatorId === me)),
    [issues, tab, me],
  )
  return (
    <IssueView
      viewKey={`my:${tab}`}
      loading={isLoading || !catalog}
      issues={mine}
      createDefaults={{ assigneeId: me }}
      title={
        <>
          <UserRoundCheck className="size-4 text-ink-2" />
          My issues
        </>
      }
      tabs={(['assigned', 'created'] as const).map((t) => (
        <Tab key={t} active={t === tab} onClick={() => navigate({ to: '/my-issues', search: { tab: t === 'created' ? t : undefined } })}>
          {t === 'assigned' ? 'Assigned' : 'Created'}
        </Tab>
      ))}
    />
  )
}
