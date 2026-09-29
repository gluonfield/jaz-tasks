import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { getApiKey } from '@/lib/auth'

export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: () => {
    if (!getApiKey()) {
      throw redirect({ to: '/login' })
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
