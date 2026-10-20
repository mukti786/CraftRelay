import { ReactNode } from 'react'

export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true"/><span>{label}</span></div>
}

export function Feedback({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <div className={tone === 'success' ? 'success' : 'alert'} role={tone === 'success' ? 'status' : 'alert'} aria-live={tone === 'success' ? 'polite' : 'assertive'}>{children}</div>
}

export function EmptyState({ icon = '◇', title, description, className = '' }: { icon?: string; title: string; description: string; className?: string }) {
  return <div className={`empty-state ${className}`.trim()} role="status"><div aria-hidden="true">{icon}</div><h3>{title}</h3><p>{description}</p></div>
}
