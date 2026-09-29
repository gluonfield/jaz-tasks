import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useCatalog } from '@/lib/queries'

export const Route = createFileRoute('/_app/')({ component: Home })

function Home() {
  const { data: catalog } = useCatalog()
  const team = catalog?.teams.find((t) => t.key === 'ENG') ?? catalog?.teams[0]
  if (!catalog) {
    return null
  }
  return team ? <Navigate to="/team/$teamKey/$view" params={{ teamKey: team.key, view: 'all' }} replace /> : <Navigate to="/my-issues" replace />
}
