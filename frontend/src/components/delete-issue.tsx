import { Button } from '@jaz/ui/button'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useDeleteIssue } from '@/lib/queries'
import type { Issue } from '@/lib/types'
import { setUI, useUI } from '@/lib/ui'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

export function DeleteIssueDialog() {
  const issue = useUI((s) => s.deleteIssue)
  const navigate = useNavigate()
  const router = useRouter()
  const remove = useDeleteIssue()
  const confirm = (issue: Issue) => remove.mutate(issue, {
    onSuccess: () => {
      setUI({ deleteIssue: null, focusedIssueId: null })
      toast(`${issue.identifier} deleted`)
      const location = router.state.location
      if (location.pathname === `/issue/${issue.identifier}`) {
        void navigate({ to: '/issues' })
      } else if (location.pathname === '/inbox' && location.search.issue === issue.identifier) {
        void navigate({ to: '/inbox', search: {} })
      }
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <Dialog open={!!issue} onOpenChange={(open) => {
      if (!open && !remove.isPending) {
        setUI({ deleteIssue: null })
      }
    }}>
      <DialogContent className="rounded-[var(--radius-card)] bg-raised">
        <DialogTitle className="text-[14px] font-medium">Delete {issue?.identifier}?</DialogTitle>
        <DialogDescription>{issue?.title}</DialogDescription>
        <div className="flex justify-end gap-2">
          <Button disabled={remove.isPending} onClick={() => setUI({ deleteIssue: null })}>Cancel</Button>
          <Button aria-label="Confirm delete issue" variant="primary" disabled={remove.isPending} onClick={() => issue && confirm(issue)}>Delete issue</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
