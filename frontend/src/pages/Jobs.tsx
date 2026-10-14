import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { JobSummary, Page } from '../lib/types'
import { Button, ErrorBox, Input, JobList, Loading, PageTitle, cx } from '../components/ui'

const TABS: { key: string; label: string; query: string }[] = [
  { key: 'open', label: 'Open', query: 'status=received&status=in_progress' },
  { key: 'received', label: 'Received', query: 'status=received' },
  { key: 'in_progress', label: 'In progress', query: 'status=in_progress' },
  { key: 'ready', label: 'Ready', query: 'status=ready' },
  { key: 'overdue', label: 'Overdue', query: 'due=overdue' },
  { key: 'collected', label: 'Collected', query: 'status=collected' },
  { key: 'all', label: 'All', query: '' },
]
const PAGE = 50

export default function Jobs() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('status') ?? 'open'
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [text, setText] = useState(q)
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]

  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) setParams({ status: tab, ...(text && { q: text }) }, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [text, q, tab, setParams])

  const { data, error, isLoading } = useQuery({
    queryKey: ['jobs', current.key, q, page],
    queryFn: () =>
      api<Page<JobSummary>>(`/api/jobs?${current.query}&limit=${PAGE}&offset=${page * PAGE}&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  })
  const pages = data ? Math.ceil(data.total / PAGE) : 0

  return (
    <div>
      <PageTitle>Jobs</PageTitle>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === current.key}
            onClick={() => setParams({ status: t.key, ...(q && { q }) })}
            className={cx(
              'h-10 shrink-0 rounded-full border px-4 font-semibold',
              t.key === current.key ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:border-ink-faint',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Input type="search" placeholder="Search job number, name or phone" value={text} onChange={(e) => setText(e.target.value)} className="mb-4" aria-label="Search jobs" />
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : data && <JobList jobs={data.items} empty={q ? `No jobs match "${q}".` : 'No jobs here.'} />}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" disabled={page === 0} onClick={() => setParams({ status: tab, ...(q && { q }), page: String(page - 1) })}>
            Previous
          </Button>
          <span className="text-sm text-ink-soft">
            Page {page + 1} of {pages}
          </span>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setParams({ status: tab, ...(q && { q }), page: String(page + 1) })}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
