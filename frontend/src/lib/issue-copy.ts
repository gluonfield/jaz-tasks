import { toast } from 'sonner'
import type { Issue } from './types'

export function issueBranchName(issue: Issue) {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${issue.identifier.toLowerCase()}-${slug}`
}

export async function copyIssue(issue: Issue, kind: 'branch' | 'copyId' | 'copyUrl') {
  const [value, label] = kind === 'branch' ? [issueBranchName(issue), 'Branch name'] : kind === 'copyId' ? [issue.identifier, 'Issue ID'] : [issue.url, 'Issue URL']
  try {
    await navigator.clipboard.writeText(value)
    toast(`${label} copied`)
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`)
  }
}
