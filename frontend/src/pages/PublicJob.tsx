import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { STATUS_FLOW, fullDate, money } from '../lib/format'
import type { JobStatus, PublicJob as PublicJobT } from '../lib/types'
import { Button, ErrorBox, JobTag, Loading, Textarea, cx } from '../components/ui'

const HEADLINE: Record<JobStatus, string> = {
  received: "We've got your clothes",
  in_progress: "We're working on it",
  ready: 'Ready for pickup',
  collected: 'All done, thank you',
  cancelled: 'This job was cancelled',
}
const STEP: Record<JobStatus, string> = {
  received: 'Received',
  in_progress: 'Being altered',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
}

function itemName(colour: string, garment: string) {
  const text = [colour.trim(), garment.toLowerCase()].filter(Boolean).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ['Poor', 'Not great', 'OK', 'Good', 'Excellent']
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}, ${labels[n - 1]}`}
          onClick={() => onChange(n)}
          className={cx('size-12 text-4xl leading-none transition-transform active:scale-90', n <= value ? 'text-tape' : 'text-line')}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function ReviewForm({ job, token }: { job: PublicJobT; token: string }) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const send = useMutation({
    mutationFn: () => api<PublicJobT>(`/api/public/jobs/${token}/review`, { method: 'POST', json: { rating, comment } }),
    onSuccess: (d) => qc.setQueryData(['public-job', token], d),
  })
  const google = job.business.google_review_url

  if (job.review) {
    const happy = job.review.rating >= 4
    return (
      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <h2 className="mb-1 text-xl font-semibold">Thank you for your review</h2>
        <p className="mb-1 text-2xl text-tape" aria-label={`${job.review.rating} out of 5`}>
          {'★'.repeat(job.review.rating)}
          <span className="text-line">{'★'.repeat(5 - job.review.rating)}</span>
        </p>
        {happy && google ? (
          <>
            <p className="mt-3 mb-4 text-ink-soft">It would really help a small business if you shared it on Google too. It takes a minute.</p>
            <a href={google} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-lg bg-thread px-5 font-semibold text-white hover:bg-thread-dark">
              Review us on Google
            </a>
          </>
        ) : (
          !happy && <p className="mt-2 text-ink-soft">Sorry it wasn't perfect. We'll be in touch to put it right.</p>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <h2 className="mb-1 text-xl font-semibold">How did we do?</h2>
      <p className="mb-3 text-ink-soft">Your feedback helps us improve.</p>
      <Stars value={rating} onChange={setRating} />
      {rating > 0 && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate()
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink-soft">Anything you'd like to add? (optional)</span>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          </label>
          <ErrorBox error={send.error} />
          <Button type="submit" size="lg" busy={send.isPending}>
            Send review
          </Button>
        </form>
      )}
    </section>
  )
}

export default function PublicJob() {
  const { token = '' } = useParams()
  const { data: job, error, isLoading } = useQuery({
    queryKey: ['public-job', token],
    queryFn: () => api<PublicJobT>(`/api/public/jobs/${token}`),
    retry: false,
  })
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    if (job) document.title = `${job.job_number}: ${HEADLINE[job.status]} | ${job.business.name}`
  }, [job])

  if (isLoading) return <Loading />
  if (error || !job)
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="mb-2 text-2xl font-bold">Job not found</h1>
        <p className="text-ink-soft">This link may be mistyped or the job may have been removed. Please contact the shop.</p>
      </div>
    )

  const idx = STATUS_FLOW.indexOf(job.status)
  const b = job.business
  const allPhotos = job.items.flatMap((i) => i.photos)
  const wa = (b.whatsapp || b.phone).replace(/\D/g, '').replace(/^0/, '353')

  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-ink px-5 pt-6 pb-16 text-white">
        <div className="mx-auto max-w-xl">
          <p className="font-display text-lg font-semibold">{b.name}</p>
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-xl space-y-5 px-4 pb-16">
        <section className="rounded-2xl bg-surface p-5 shadow-[0_10px_40px_-18px_rgba(28,34,51,0.45)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <JobTag number={job.job_number} />
            {job.status === 'ready' && <span className="rounded-full bg-ready-tint px-3 py-1 text-sm font-semibold text-ready">Ready</span>}
          </div>
          <h1 className="text-[28px] leading-tight font-bold">
            Hi {job.first_name}, {HEADLINE[job.status].charAt(0).toLowerCase() + HEADLINE[job.status].slice(1)}
          </h1>
          {job.status !== 'cancelled' && (
            <ol className="mt-5 grid grid-cols-4 gap-1">
              {STATUS_FLOW.map((s, i) => (
                <li key={s}>
                  <div className={cx('mb-1.5 h-1.5 rounded-full', i <= idx ? 'bg-ready' : 'bg-line')} />
                  <span className={cx('text-xs sm:text-sm', i === idx ? 'font-semibold' : 'text-ink-faint')}>{STEP[s]}</span>
                </li>
              ))}
            </ol>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
            {job.status !== 'collected' && job.status !== 'ready' && job.due_date && (
              <div>
                <dt className="text-sm text-ink-soft">Expected ready</dt>
                <dd className="font-semibold">{fullDate(job.due_date + 'T12:00:00')}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-ink-soft">{job.paid || job.balance_due === 0 ? 'Total (paid)' : 'To pay on pickup'}</dt>
              <dd className="font-display text-xl font-bold tabular-nums">{money(job.paid || job.balance_due === 0 ? job.total_price : job.balance_due)}</dd>
            </div>
          </dl>
        </section>

        {(job.status === 'ready' || job.status === 'received' || job.status === 'in_progress') && (b.address || b.opening_hours || b.phone) && (
          <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
            <h2 className="mb-2 text-xl font-semibold">{job.status === 'ready' ? 'Where to collect' : 'Find us'}</h2>
            {b.address && (
              <p className="mb-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address} ${b.eircode}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line underline-offset-4"
                >
                  {b.address}
                  {b.eircode && `, ${b.eircode}`}
                </a>
              </p>
            )}
            {b.opening_hours && <p className="mb-3 whitespace-pre-line text-ink-soft">{b.opening_hours}</p>}
            <div className="flex flex-wrap gap-2">
              {b.phone && (
                <a href={`tel:${b.phone}`} className="inline-flex h-11 items-center rounded-lg border border-line px-4 font-semibold">
                  Call
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-lg border border-line px-4 font-semibold">
                  WhatsApp
                </a>
              )}
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          <h2 className="mb-3 text-xl font-semibold">Your {job.items.length > 1 ? `${job.items.length} items` : 'item'}</h2>
          <ul className="space-y-5">
            {job.items.map((item, i) => {
              const before = item.photos.filter((p) => p.type === 'before')
              const after = item.photos.filter((p) => p.type === 'after')
              return (
                <li key={i}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold">{itemName(item.colour, item.garment_type)}</h3>
                    <span className="tabular-nums">{money(item.job_price)}</span>
                  </div>
                  {item.details && <p className="text-ink-soft whitespace-pre-line">{item.details}</p>}
                  {(before.length > 0 || after.length > 0) && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {(
                        [
                          ['Before', before],
                          ['After', after],
                        ] as const
                      ).map(([label, list]) => (
                        <figure key={label}>
                          <figcaption className="mb-1 text-sm font-semibold text-ink-soft">{label}</figcaption>
                          {list.length ? (
                            <div className="grid gap-2">
                              {list.map((p) => (
                                <button key={p.url} type="button" onClick={() => setZoom(p.url)} className="block overflow-hidden rounded-lg">
                                  <img src={p.thumb_url} alt={p.alt_text} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-line px-2 text-center text-sm text-ink-faint">
                              {label === 'After' && job.status !== 'ready' && job.status !== 'collected' ? 'Coming soon' : 'No photo'}
                            </div>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {allPhotos.length === 0 && <p className="mt-3 text-sm text-ink-faint">Photos will appear here when they're added.</p>}
        </section>

        {(job.status === 'ready' || job.status === 'collected') && <ReviewForm job={job} token={token} />}

        <p className="pt-2 text-center text-sm text-ink-faint">This page is private to you. Please don't share the link.</p>
      </main>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
          <button type="button" className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white" aria-label="Close" onClick={() => setZoom(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
