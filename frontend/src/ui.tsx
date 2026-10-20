import { ReactNode } from 'react'
import { Localized } from './i18n'

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <Localized><div className="loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true"/><span>{label}</span></div></Localized>
}

export function Feedback({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <Localized><div className={tone === 'success' ? 'success' : 'alert'} role={tone === 'success' ? 'status' : 'alert'} aria-live={tone === 'success' ? 'polite' : 'assertive'}>{children}</div></Localized>
}

export function EmptyState({ icon = '◇', title, description, className = '' }: { icon?: string; title: string; description: string; className?: string }) {
  return <Localized><div className={`empty-state ${className}`.trim()} role="status"><div aria-hidden="true">{icon}</div><h3>{title}</h3><p>{description}</p></div></Localized>
}
