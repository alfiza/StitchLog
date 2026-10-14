import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fullName, looksLikePhone } from '../lib/format'
import type { CustomerListItem, Page } from '../lib/types'
import { ButtonLink, Spinner } from './ui'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * The big box at the top of Today: type a phone number (or name) and the
 * customer shows up straight away with a "New job" button.
 */
export default function CustomerFinder({ autoFocus }: { autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 200)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const isPhone = looksLikePhone(q)
  const digits = q.replace(/\D/g, '')
  const isJobNumber = /^[a-z]{1,4}-?\d{1,6}$/i.test(q)

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'find', q],
    queryFn: () => api<Page<CustomerListItem>>(`/api/customers?limit=6&q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  })

  async function onEnter() {
    if (isJobNumber) {
      try {
        const job = await api<{ id: number }>(`/api/jobs/by-number/${encodeURIComponent(q.toUpperCase().replace(/^([A-Z]+)(\d)/, '$1-$2'))}`)
        navigate(`/jobs/${job.id}`)
        return
      } catch {
        /* not a job number after all */
      }
    }
    if (data?.items.length === 1) navigate(`/customers/${data.items[0].id}`)
  }

  const results = q.length >= 2 ? (data?.items ?? []) : []
  const fullNumber = isPhone && digits.length >= 9

  return (
    <div className="rounded-2xl bg-ink p-4 text-white md:p-6">
      <label htmlFor="finder" className="mb-2 block font-display text-lg font-semibold">
        Customer phone number
      </label>
      <div className="relative">
        <input
          id="finder"
          ref={inputRef}
          autoFocus={autoFocus}
          inputMode="tel"
          autoComplete="off"
          placeholder="087 123 4567"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          className="h-16 w-full rounded-xl border-2 border-transparent bg-white px-4 font-display text-[26px] font-semibold tracking-wide text-ink placeholder:text-ink/25 focus:border-tape focus:outline-none"
        />
        {isFetching && (
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-thread">
            <Spinner small />
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-white/60">Name or job number works too.</p>

      {q.length >= 2 && (
        <div className="mt-4 space-y-2">
          {results.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/8 p-3">
              <Link to={`/customers/${c.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold">{fullName(c)}</div>
                <div className="text-sm text-white/65 tabular-nums">
                  {c.phone_display}
                  {c.job_count > 0 && `, ${c.job_count} job${c.job_count > 1 ? 's' : ''}`}
                  {c.open_jobs > 0 && <span className="text-tape">, {c.open_jobs} open</span>}
                </div>
              </Link>
              <ButtonLink to={`/jobs/new?customer=${c.id}`} variant="tape" className="shrink-0">
                New job
              </ButtonLink>
            </div>
          ))}
          {!isFetching && results.length === 0 && (
            <div className="rounded-xl bg-white/8 p-4">
              <p className="mb-3 text-white/80">{isPhone ? 'No customer with this number yet.' : 'No customer found.'}</p>
              <ButtonLink
                to={`/customers/new?${isPhone ? `phone=${encodeURIComponent(q)}` : `name=${encodeURIComponent(q)}`}&then=job`}
                variant="tape"
              >
                Add new customer
              </ButtonLink>
            </div>
          )}
          {results.length > 0 && fullNumber && !results.some((c) => c.phone.endsWith(digits.replace(/^0/, ''))) && (
            <Link to={`/customers/new?phone=${encodeURIComponent(q)}&then=job`} className="block px-1 pt-1 text-sm font-semibold text-tape underline">
              Not them? Add {q} as a new customer
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
