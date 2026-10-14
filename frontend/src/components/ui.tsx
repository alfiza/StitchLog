import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { twMerge } from 'tailwind-merge'
import { STATUS_LABEL, dayLabel, fullDate, fullName, isLate, money } from '../lib/format'
import type { JobStatus, JobSummary } from '../lib/types'

/** Join class names; when two Tailwind classes clash (w-full vs w-32) the later one wins. */
export function cx(...c: (string | false | null | undefined)[]) {
  return twMerge(c.filter(Boolean).join(' '))
}

// ---------- buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ready' | 'tape' | 'remove'
const variants: Record<Variant, string> = {
  primary: 'bg-thread text-white hover:bg-thread-dark disabled:bg-thread/50',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-faint disabled:text-ink-faint',
  ghost: 'text-thread hover:bg-thread-tint',
  danger: 'bg-surface text-late border border-late/30 hover:bg-late-tint',
  ready: 'bg-ready text-white hover:brightness-110',
  tape: 'bg-tape text-ink hover:brightness-105',
  remove: 'text-late hover:bg-late-tint',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; size?: 'md' | 'lg' | 'sm' }
>(function Button({ variant = 'primary', busy, size = 'md', className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'lg' && 'h-13 px-5 text-[17px]',
        size === 'md' && 'h-11 px-4',
        size === 'sm' && 'h-9 px-3 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  )
})

export function ButtonLink({ to, variant = 'primary', className, children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx('inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold transition-colors', variants[variant], className)}
    >
      {children}
    </Link>
  )
}

// ---------- form fields ----------
const fieldBase =
  'w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-faint focus:border-thread focus:outline-none focus:ring-2 focus:ring-thread/20 aria-[invalid=true]:border-late'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-11', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'min-h-20 py-2', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(fieldBase, 'h-11', className)} {...rest}>
      {children}
    </select>
  )
})

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-late">{error}</span> : hint ? <span className="mt-1 block text-sm text-ink-faint">{hint}</span> : null}
    </label>
  )
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" className="size-5 rounded accent-thread" {...rest} />
      <span>{label}</span>
    </label>
  )
}

// ---------- feedback ----------
export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', small ? 'size-4' : 'size-6 text-thread')}
    />
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <p className="rounded-lg border border-late/30 bg-late-tint px-4 py-3 text-late">{msg}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-ink-soft">{children}</div>
}

// ---------- page chrome ----------
export function PageTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-bold md:text-[34px]">{children}</h1>
          {sub && <p className="mt-1 text-ink-soft">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="stitch mt-3 w-16" aria-hidden />
    </header>
  )
}

export function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {title}
          {count != null && <span className="ml-2 font-sans text-base font-normal text-ink-faint">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// ---------- job pieces ----------
/** The job number drawn as the paper tag tied to the garment. */
export function JobTag({ number, size = 'sm', swing }: { number: string; size?: 'sm' | 'lg'; swing?: boolean }) {
  return (
    <span
      className={cx(
        'relative inline-flex shrink-0 items-center rounded-md bg-tape font-display font-bold text-ink tabular-nums',
        size === 'sm' ? 'h-7 pr-2 pl-5 text-sm' : 'h-12 pr-4 pl-8 text-2xl',
        swing && 'tag-swing',
      )}
    >
      <span
        aria-hidden
        className={cx('absolute rounded-full bg-paper ring-1 ring-ink/25', size === 'sm' ? 'left-1.5 size-2' : 'left-3 size-3')}
      />
      {number}
    </span>
  )
}

const statusStyle: Record<JobStatus, string> = {
  received: 'bg-[#eef0f4] text-ink-soft',
  in_progress: 'bg-thread-tint text-thread',
  ready: 'bg-ready-tint text-ready',
  collected: 'bg-transparent text-ink-faint border border-line',
  cancelled: 'bg-transparent text-ink-faint line-through border border-line',
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={cx('inline-flex h-7 items-center rounded-full px-3 text-sm font-semibold', statusStyle[status])}>{STATUS_LABEL[status]}</span>
}

function dueText(due: string | null, late: boolean): string {
  if (!due) return 'No due date'
  const label = dayLabel(due)
  if (late) return label
  return label === 'Today' || label === 'Tomorrow' ? `Due ${label.toLowerCase()}` : `Due ${label}`
}

export function DueLabel({ job }: { job: Pick<JobSummary, 'due_date' | 'status' | 'urgent'> }) {
  const late = isLate(job)
  const done = job.status === 'collected' || job.status === 'cancelled'
  return (
    <span className={cx('text-sm', late ? 'font-semibold text-late' : 'text-ink-soft', done && 'text-ink-faint')}>
      {job.urgent && !done && <span className="mr-1.5 rounded bg-late px-1.5 py-0.5 text-xs font-bold text-white">Urgent</span>}
      {done ? '' : dueText(job.due_date, late)}
    </span>
  )
}

export function JobRow({ job, showCustomer = true }: { job: JobSummary; showCustomer?: boolean }) {
  const title = showCustomer && job.customer ? fullName(job.customer) : job.items_label || 'No items'
  const sub = showCustomer ? job.items_label : `In ${fullDate(job.created_at)}`
  const owing = job.balance_due > 0 && job.status !== 'cancelled'
  return (
    <li>
      <Link to={`/jobs/${job.id}`} className="block border-b border-line px-1 py-3 last:border-b-0 hover:bg-thread-tint/40 md:px-3">
        <div className="flex items-center gap-3">
          <JobTag number={job.job_number} />
          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          <StatusBadge status={job.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-1">
          <span className="min-w-0 truncate text-sm text-ink-soft">{sub}</span>
          <DueLabel job={job} />
          <span className="ml-auto text-sm text-ink-soft tabular-nums">
            {money(job.total_price)}
            {owing && <span className="text-late"> ({money(job.balance_due)} due)</span>}
          </span>
        </div>
      </Link>
    </li>
  )
}

export function JobList({ jobs, empty, showCustomer = true }: { jobs: JobSummary[]; empty: ReactNode; showCustomer?: boolean }) {
  if (!jobs.length) return <Empty>{empty}</Empty>
  return (
    <ul className="rounded-xl border border-line bg-surface px-2">
      {jobs.map((j) => (
        <JobRow key={j.id} job={j} showCustomer={showCustomer} />
      ))}
    </ul>
  )
}
