import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button, ButtonLink, Empty, ErrorBox, Input, Loading, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { fullDate, fullName } from '../lib/format'
import type { CustomerListItem, Page } from '../lib/types'

const PAGE = 50

export default function Customers() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)

  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) setParams(text ? { q: text } : {}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [text, q, setParams])

  const { data, error, isLoading } = useQuery({
    queryKey: ['customers', 'list', q, page],
    queryFn: () => api<Page<CustomerListItem>>(`/api/customers?limit=${PAGE}&offset=${page * PAGE}&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  })

  const pages = data ? Math.ceil(data.total / PAGE) : 0

  return (
    <div>
      <PageTitle action={<ButtonLink to="/customers/new">Add customer</ButtonLink>} sub={data && `${data.total} customer${data.total === 1 ? '' : 's'}`}>
        Customers
      </PageTitle>
      <Input type="search" placeholder="Search by name or phone" value={text} onChange={(e) => setText(e.target.value)} className="mb-4" aria-label="Search customers" />
      <ErrorBox error={error} />
      {isLoading && <Loading />}
      {data && data.items.length === 0 && <Empty>{q ? `No one matches "${q}".` : 'No customers yet. Add your first one.'}</Empty>}
      {data && data.items.length > 0 && (
        <ul className="rounded-xl border border-line bg-surface px-2">
          {data.items.map((c) => (
            <li key={c.id}>
              <Link to={`/customers/${c.id}`} className="flex items-center gap-3 border-b border-line px-1 py-3 last:border-b-0 hover:bg-thread-tint/40 md:px-3">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-thread-tint font-display font-bold text-thread">
                  {c.first_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {fullName(c)}
                    {c.tags && <span className="ml-2 text-sm font-normal text-ink-faint">{c.tags}</span>}
                  </div>
                  <div className="text-sm text-ink-soft tabular-nums">{c.phone_display}</div>
                </div>
                <div className="shrink-0 text-right text-sm text-ink-soft">
                  {c.job_count > 0 ? `${c.job_count} job${c.job_count > 1 ? 's' : ''}` : 'No jobs yet'}
                  {c.open_jobs > 0 && <div className="font-semibold text-thread">{c.open_jobs} open</div>}
                  {c.job_count > 0 && c.last_visit && !c.open_jobs && <div className="text-ink-faint">{fullDate(c.last_visit)}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" disabled={page === 0} onClick={() => setParams({ ...(q && { q }), page: String(page - 1) })}>
            Previous
          </Button>
          <span className="text-sm text-ink-soft">
            Page {page + 1} of {pages}
          </span>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setParams({ ...(q && { q }), page: String(page + 1) })}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
