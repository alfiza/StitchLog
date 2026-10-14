import { useQuery } from '@tanstack/react-query'
import CustomerFinder from '../components/CustomerFinder'
import { ErrorBox, JobList, Loading, Section } from '../components/ui'
import { api } from '../lib/api'
import { fullDate, money } from '../lib/format'
import type { Dashboard } from '../lib/types'
import { Link } from 'react-router-dom'

function Stat({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const body = (
    <>
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-ink-soft">{label}</div>
    </>
  )
  return to ? (
    <Link to={to} className="block border-l-2 border-line pl-3 hover:border-thread">
      {body}
    </Link>
  ) : (
    <div className="border-l-2 border-line pl-3">{body}</div>
  )
}

export default function Today() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/api/dashboard'),
    refetchInterval: 60_000,
  })

  return (
    <div>
      <p className="mb-3 text-ink-soft">{data ? fullDate(data.today + 'T12:00:00') : ' '}</p>
      <CustomerFinder />

      {isLoading && <Loading />}
      <div className="mt-6">
        <ErrorBox error={error} />
      </div>

      {data && (
        <>
          <div className="my-8 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat label="Waiting to start" value={data.received_count} to="/jobs?status=received" />
            <Stat label="In progress" value={data.in_progress_count} to="/jobs?status=in_progress" />
            <Stat label="Collected this week" value={money(data.week_income)} />
            <Stat label="New jobs this week" value={data.week_jobs_in} />
          </div>

          {data.overdue.length > 0 && (
            <Section title="Overdue" count={data.overdue.length}>
              <JobList jobs={data.overdue} empty="" />
            </Section>
          )}

          <Section title="Due today" count={data.due_today.length}>
            <JobList jobs={data.due_today} empty="Nothing due today." />
          </Section>

          <Section title="Ready for pickup" count={data.ready_not_collected.length}>
            <JobList jobs={data.ready_not_collected} empty="No finished jobs waiting to be collected." />
          </Section>

          <Section title="This month">
            <p className="text-ink-soft">
              {money(data.month_income)} collected so far.
              {data.review_count > 0 && (
                <>
                  {' '}
                  Customers rate you {data.average_rating} out of 5 from {data.review_count} review{data.review_count > 1 ? 's' : ''}.
                </>
              )}{' '}
              {data.customer_count} customers on file.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
