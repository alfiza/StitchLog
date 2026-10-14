import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { compressImage } from '../lib/compress'
import { STATUS_FLOW, STATUS_LABEL, dateTime, dayLabel, fullDate, fullName, isLate, money } from '../lib/format'
import type { Job, JobItem, JobStatus, PaymentMethod, Photo, PhotoType } from '../lib/types'
import { Button, ButtonLink, ErrorBox, JobTag, Loading, Select, StatusBadge, cx } from '../components/ui'

function useJobMutation<T>(jobId: number, fn: (v: T) => Promise<Job>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (job) => {
      qc.setQueryData(['job', String(jobId)], job)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
    },
  })
}

// ---------- status ----------
const NEXT: Partial<Record<JobStatus, { to: JobStatus; label: string; variant: 'primary' | 'ready' }>> = {
  received: { to: 'in_progress', label: 'Start work', variant: 'primary' },
  in_progress: { to: 'ready', label: 'Mark ready and tell customer', variant: 'ready' },
  ready: { to: 'collected', label: 'Mark collected', variant: 'primary' },
}

function StatusPanel({ job }: { job: Job }) {
  const setStatus = useJobMutation(job.id, (v: { status: JobStatus; notify?: boolean }) =>
    api<Job>(`/api/jobs/${job.id}/status`, { method: 'POST', json: v }),
  )
  const markPaid = useJobMutation(job.id, (method: PaymentMethod | null) =>
    api<Job>(`/api/jobs/${job.id}`, { method: 'PATCH', json: { paid: true, payment_method: method ?? job.payment_method } }),
  )
  const [method, setMethod] = useState<PaymentMethod | ''>(job.payment_method ?? '')
  const next = NEXT[job.status]
  const idx = STATUS_FLOW.indexOf(job.status)

  return (
    <section className="mb-8 rounded-2xl border border-line bg-surface p-4 md:p-5">
      <ol className="mb-4 grid grid-cols-4 gap-1" aria-label="Job progress">
        {STATUS_FLOW.map((s, i) => (
          <li key={s} className="text-center">
            <div className={cx('mb-1.5 h-1.5 rounded-full', i <= idx ? (s === 'ready' || s === 'collected' ? 'bg-ready' : 'bg-thread') : 'bg-line')} />
            <span className={cx('text-xs sm:text-sm', i === idx ? 'font-semibold text-ink' : 'text-ink-faint')}>{STATUS_LABEL[s]}</span>
          </li>
        ))}
      </ol>

      {job.status === 'cancelled' && <p className="mb-3 text-ink-soft">This job was cancelled.</p>}

      {next && (
        <Button
          size="lg"
          variant={next.variant}
          className="w-full"
          busy={setStatus.isPending && setStatus.variables?.status === next.to}
          onClick={() => setStatus.mutate({ status: next.to })}
        >
          {next.label}
        </Button>
      )}

      {job.status === 'collected' && <p className="text-ready">Collected {dateTime(job.collected_at)}.</p>}

      {job.balance_due > 0 && job.status !== 'cancelled' && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-tape-tint px-3 py-3">
          <span className="mr-auto font-semibold">{money(job.balance_due)} still to pay</span>
          <Select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 w-32">
            <option value="">Method</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="revolut">Revolut</option>
            <option value="other">Other</option>
          </Select>
          <Button size="sm" className="h-10" busy={markPaid.isPending} onClick={() => markPaid.mutate(method || null)}>
            Mark paid
          </Button>
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-soft">Change status by hand</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['received', 'in_progress', 'ready', 'collected', 'cancelled'] as JobStatus[])
            .filter((s) => s !== job.status)
            .map((s) => (
              <Button key={s} variant="secondary" size="sm" onClick={() => setStatus.mutate({ status: s, notify: false })}>
                {STATUS_LABEL[s]}
              </Button>
            ))}
        </div>
        <p className="mt-2 text-ink-faint">Changing it here never sends a message.</p>
      </details>
      <ErrorBox error={setStatus.error || markPaid.error} />
    </section>
  )
}

// ---------- telling the customer ----------
function NotifyPanel({ job }: { job: Job }) {
  const [copied, setCopied] = useState(false)
  const logSent = useJobMutation(job.id, () => api<Job>(`/api/jobs/${job.id}/whatsapp-sent?kind=ready`, { method: 'POST' }))
  const ready = job.messages.filter((m) => m.kind !== 'received')
  const lastAuto = [...ready].reverse().find((m) => m.channel !== 'whatsapp_link')
  const sentByHand = ready.some((m) => m.channel === 'whatsapp_link')
  const autoSent = lastAuto && lastAuto.status === 'sent'

  async function copy() {
    try {
      await navigator.clipboard.writeText(job.public_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', job.public_url)
    }
  }

  return (
    <section className="mb-8 rounded-2xl border-2 border-ready/40 bg-ready-tint p-4 md:p-5">
      <h2 className="mb-1 text-xl font-semibold">Tell {job.customer?.first_name} it's ready</h2>
      <p className="mb-4 text-ink-soft">
        {autoSent
          ? `Text sent automatically ${dateTime(lastAuto.sent_at)}.`
          : lastAuto?.status === 'failed'
            ? 'The automatic text failed. Send it on WhatsApp instead.'
            : sentByHand
              ? 'Sent on WhatsApp. You can send it again if needed.'
              : 'Send the message from your phone. It includes a link to the before and after photos and a review form.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={job.whatsapp_url}
          target="_blank"
          rel="noreferrer"
          onClick={() => !sentByHand && logSent.mutate(undefined)}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-ready px-4 font-semibold text-white hover:brightness-110"
        >
          Send on WhatsApp
        </a>
        <a href={`sms:${job.customer?.phone}`} className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 font-semibold">
          Text
        </a>
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Link copied' : 'Copy job page link'}
        </Button>
      </div>
    </section>
  )
}

/** "We have your job" message with the details, sent when the job is created */
function DetailsPanel({ job, highlight }: { job: Job; highlight: boolean }) {
  const logSent = useJobMutation(job.id, () => api<Job>(`/api/jobs/${job.id}/whatsapp-sent?kind=received`, { method: 'POST' }))
  const details = job.messages.filter((m) => m.kind === 'received')
  const autoSent = details.find((m) => m.channel !== 'whatsapp_link' && m.status === 'sent')
  const failed = details.find((m) => m.channel !== 'whatsapp_link' && m.status === 'failed')
  const sentByHand = details.find((m) => m.channel === 'whatsapp_link')
  const done = autoSent || sentByHand

  if (done && !highlight)
    return (
      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>
          Job details sent to {job.customer?.first_name} {dateTime((autoSent ?? sentByHand)!.sent_at)}
          {sentByHand && !autoSent ? ' on WhatsApp' : ''}.
        </span>
        <a href={job.whatsapp_received_url} target="_blank" rel="noreferrer" className="font-semibold text-thread hover:underline">
          Send again
        </a>
      </p>
    )

  return (
    <section className="mb-8 rounded-2xl border-2 border-thread/30 bg-thread-tint p-4 md:p-5">
      <h2 className="mb-1 text-xl font-semibold">Send {job.customer?.first_name} the job details</h2>
      <p className="mb-4 text-ink-soft">
        {autoSent
          ? `Sent automatically ${dateTime(autoSent.sent_at)}.`
          : failed
            ? 'The automatic text failed. Send it on WhatsApp instead.'
            : sentByHand
              ? 'Sent on WhatsApp. You can send it again if anything changed.'
              : 'Items, prices, what is paid, the ready date and a link to follow the job. Send it from your phone so they have it in writing.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={job.whatsapp_received_url}
          target="_blank"
          rel="noreferrer"
          onClick={() => !sentByHand && logSent.mutate(undefined)}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-thread px-4 font-semibold text-white hover:bg-thread-dark"
        >
          Send details on WhatsApp
        </a>
        <a href={`sms:${job.customer?.phone}`} className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 font-semibold">
          Text
        </a>
      </div>
      <ErrorBox error={logSent.error} />
    </section>
  )
}

// ---------- photos ----------
function PhotoStrip({ item, type, jobId }: { item: JobItem; type: PhotoType; jobId: number }) {
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const photos = item.photos.filter((p) => p.type === type)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    try {
      const list = Array.from(files)
      const fd = new FormData()
      fd.append('type', type)
      for (let i = 0; i < list.length; i++) {
        setProgress(`Preparing ${i + 1} of ${list.length}…`)
        fd.append('files', await compressImage(list[i]))
      }
      setProgress('Uploading…')
      await api<Photo[]>(`/api/job-items/${item.id}/photos`, { method: 'POST', body: fd })
      await qc.invalidateQueries({ queryKey: ['job', String(jobId)] })
    } catch (e) {
      setError(e)
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  const del = useMutation({
    mutationFn: (photoId: number) => api(`/api/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', String(jobId)] }),
  })

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink-soft">{type === 'before' ? 'Before' : 'After'}</h4>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="group relative">
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={p.thumb_url} alt={p.alt_text} className="size-24 rounded-lg object-cover ring-1 ring-line" loading="lazy" />
            </a>
            <button
              type="button"
              aria-label="Delete photo"
              onClick={() => confirm('Delete this photo?') && del.mutate(p.id)}
              className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-ink text-sm text-white opacity-90 hover:bg-late"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!!progress}
          className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-sm text-ink-soft hover:border-thread hover:text-thread disabled:opacity-60"
        >
          {progress ? (
            <span className="px-1 text-center text-xs">{progress}</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Add photo
            </>
          )}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <ErrorBox error={error || del.error} />
    </div>
  )
}

function ItemCard({ item, jobId }: { item: JobItem; jobId: number }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">
          {item.colour && <span className="font-normal text-ink-soft">{item.colour} </span>}
          {item.garment_type}
        </h3>
        <span className="font-display text-lg font-semibold tabular-nums">{money(item.job_price)}</span>
      </div>
      {item.details && <p className="mb-1 whitespace-pre-line">{item.details}</p>}
      {item.original_price != null && <p className="text-sm text-ink-faint">Garment cost {money(item.original_price)}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PhotoStrip item={item} type="before" jobId={jobId} />
        <PhotoStrip item={item} type="after" jobId={jobId} />
      </div>
    </article>
  )
}

// ---------- page ----------
export default function JobDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const isNew = params.get('new') === '1'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: job, error, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/api/jobs/${id}`) })

  const toggleReview = useMutation({
    mutationFn: (v: { id: number; show: boolean }) => api(`/api/reviews/${v.id}`, { method: 'PATCH', json: { show_on_website: v.show } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', id] }),
  })
  const del = useMutation({
    mutationFn: () => api(`/api/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      navigate(job?.customer ? `/customers/${job.customer.id}` : '/jobs', { replace: true })
    },
  })

  if (isLoading) return <Loading />
  if (error || !job) return <ErrorBox error={error ?? 'Job not found'} />

  const late = isLate(job)
  return (
    <div>
      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <JobTag number={job.job_number} size="lg" swing={isNew} />
          <StatusBadge status={job.status} />
          {job.urgent && <span className="rounded bg-late px-2 py-1 text-sm font-bold text-white">Urgent</span>}
        </div>
        {job.customer && (
          <h1 className="text-[28px] leading-tight font-bold md:text-[34px]">
            <Link to={`/customers/${job.customer.id}`} className="hover:underline">
              {fullName(job.customer)}
            </Link>
          </h1>
        )}
        <p className="mt-1 text-ink-soft">
          <a href={`tel:${job.customer?.phone}`} className="tabular-nums">
            {job.customer?.phone_display}
          </a>
          <span className="mx-2 text-line">|</span>
          In {fullDate(job.created_at)}
          <span className="mx-2 text-line">|</span>
          <span className={cx(late && 'font-semibold text-late')}>
            {job.due_date ? `Due ${fullDate(job.due_date + 'T12:00:00')} (${dayLabel(job.due_date).toLowerCase()})` : 'No due date'}
          </span>
        </p>
        <div className="stitch mt-3 w-16" aria-hidden />
      </header>

      {isNew && (
        <div className="mb-6 rounded-2xl border-2 border-tape bg-tape-tint p-4">
          <p className="mb-2 font-semibold">
            Job saved. Write <span className="font-display">{job.job_number}</span> on the tag and attach it to the garment.
          </p>
          <p className="mb-3 text-ink-soft">Take the before photos now while the customer is here.</p>
          <Button size="sm" variant="secondary" onClick={() => setParams({}, { replace: true })}>
            Done
          </Button>
        </div>
      )}

      {(job.status === 'received' || job.status === 'in_progress') && <DetailsPanel job={job} highlight={isNew} />}
      <StatusPanel job={job} />
      {job.status === 'ready' && <NotifyPanel job={job} />}

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">
          {job.items.length} item{job.items.length > 1 ? 's' : ''}
        </h2>
        <div className="space-y-3">
          {job.items.map((item) => (
            <ItemCard key={item.id} item={item} jobId={job.id} />
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-ink px-4 py-3 text-white">
          <div>
            <dt className="text-sm text-white/60">Total</dt>
            <dd className="font-display text-xl font-bold tabular-nums">{money(job.total_price)}</dd>
          </div>
          <div>
            <dt className="text-sm text-white/60">Deposit</dt>
            <dd className="font-display text-xl tabular-nums">{money(job.deposit)}</dd>
          </div>
          <div>
            <dt className="text-sm text-white/60">{job.paid ? `Paid${job.payment_method ? ` (${job.payment_method})` : ''}` : 'To pay'}</dt>
            <dd className={cx('font-display text-xl font-bold tabular-nums', job.balance_due > 0 && 'text-tape')}>{money(job.balance_due)}</dd>
          </div>
        </dl>
      </section>

      {job.notes && (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Notes</h2>
          <p className="rounded-xl border-l-4 border-tape bg-tape-tint px-4 py-3 whitespace-pre-line">{job.notes}</p>
        </section>
      )}

      {job.review && (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Customer review</h2>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-1 text-xl text-tape" aria-label={`${job.review.rating} out of 5`}>
              {'★'.repeat(job.review.rating)}
              <span className="text-line">{'★'.repeat(5 - job.review.rating)}</span>
            </p>
            {job.review.comment && <p className="mb-3">"{job.review.comment}"</p>}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-thread"
                checked={job.review.show_on_website}
                onChange={(e) => toggleReview.mutate({ id: job.review!.id, show: e.target.checked })}
              />
              Show on website
            </label>
          </div>
        </section>
      )}

      {job.messages.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Messages</h2>
          <ul className="space-y-2">
            {job.messages.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="mb-1 text-ink-soft">
                  <span className="font-semibold text-ink">{m.kind === 'received' ? 'Job details' : 'Job ready'}</span>, {dateTime(m.sent_at)},{' '}
                  {m.channel === 'whatsapp_link' ? 'sent by you on WhatsApp' : m.channel === 'console' ? 'prepared (automatic texts not set up)' : `${m.channel}: ${m.status}`}
                </div>
                <p>{m.body}</p>
                {m.error && <p className="mt-1 text-late">{m.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <ButtonLink to={`/jobs/${job.id}/edit`} variant="secondary">
          Edit job
        </ButtonLink>
        <a href={job.public_url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-lg px-4 font-semibold text-thread hover:bg-thread-tint">
          View customer's page
        </a>
        <Button variant="remove" className="ml-auto" busy={del.isPending} onClick={() => confirm(`Delete job ${job.job_number} and its photos? This can't be undone.`) && del.mutate()}>
          Delete job
        </Button>
      </div>
      <ErrorBox error={del.error || toggleReview.error} />
    </div>
  )
}
