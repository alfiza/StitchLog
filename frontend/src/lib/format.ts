import type { JobStatus, JobSummary } from './types'

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
export const money = (n: number | null | undefined) => (n == null ? '' : euro.format(n))

const dayFmt = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** "2026-10-20" -> Date at local midnight (avoids the UTC off-by-one) */
export function parseDay(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayLabel(d: string | null): string {
  if (!d) return 'No due date'
  const today = parseDay(todayISO())
  const target = parseDay(d)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0) return `${-diff} days late`
  if (diff < 7) return dayFmt.format(target)
  return fullFmt.format(target)
}

export const fullDate = (iso: string | null) => (iso ? fullFmt.format(new Date(iso)) : '')
export const dateTime = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : '')

export const STATUS_LABEL: Record<JobStatus, string> = {
  received: 'Received',
  in_progress: 'In progress',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
}

export const STATUS_FLOW: JobStatus[] = ['received', 'in_progress', 'ready', 'collected']

export function isLate(job: Pick<JobSummary, 'due_date' | 'status'>): boolean {
  return !!job.due_date && job.due_date < todayISO() && (job.status === 'received' || job.status === 'in_progress')
}

export const fullName = (c: { first_name: string; last_name: string } | null | undefined) =>
  c ? `${c.first_name} ${c.last_name}`.trim() : ''

export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/\D/g, '')
  return digits.length >= 3 && digits.length / text.replace(/\s/g, '').length > 0.6
}
