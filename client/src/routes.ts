export const dashboardSections = ['overview', 'history', 'news', 'agent', 'trades', 'wallets'] as const
export type DashboardSection = typeof dashboardSections[number]

export function dashboardPath(section: DashboardSection) {
  return section === 'overview' ? '/dashboard' : `/dashboard/${section}`
}

export function dashboardRoute(path: string): DashboardSection | null {
  const normalized = path.replace(/\/+$/, '') || '/'
  return dashboardSections.find(section => dashboardPath(section) === normalized) ?? null
}
