import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fullName, money, parseDay, todayISO } from '../lib/format'
import type { CustomerMini, JobSummary, Page } from '../lib/types'
import { toISO, type SpendSummary } from '../lib/inventory'
import { ErrorBox, Loading, PageTitle, cx } from '../components/ui'

type Period = 'day' | 'week' | 'month' | 'year' | 'range'

const PERIODS: { key: Period; label: string; prev: string }[] = [
  { key: 'day', label: 'Daily', prev: 'yesterday' },
  { key: 'week', label: 'Weekly', prev: 'last week' },
  { key: 'month', label: 'Monthly', prev: 'last month' },
  { key: 'year', label: 'Yearly', prev: 'last year' },
  { key: 'range', label: 'Date range', prev: 'previous period' },
]

async function fetchAllJobs(): Promise<JobSummary[]> {
  const all: JobSummary[] = []
  for (let offset = 0; ; offset += 200) {
    const page = await api<Page<JobSummary>>(`/api/jobs?limit=200&offset=${offset}`)
    all.push(...page.items)
    if (page.items.length < 200 || all.length >= page.total) return all
  }
}

function startOf(period: Period, d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (period === 'week') s.setDate(s.getDate() - ((s.getDay() + 6) % 7)) // weeks start Monday
  if (period === 'month') s.setDate(1)
  if (period === 'year') s.setMonth(0, 1)
  return s
}

function shift(period: Period, d: Date, n: number): Date {
  const s = new Date(d)
  if (period === 'day') s.setDate(s.getDate() + n)
  if (period === 'week') s.setDate(s.getDate() + 7 * n)
  if (period === 'month') s.setMonth(s.getMonth() + n)
  if (period === 'year') s.setFullYear(s.getFullYear() + n)
  return s
}

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000)

const fmtDay = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtShort = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' })
const fmtMonth = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' })
const fmtMonthShort = new Intl.DateTimeFormat('en-IE', { month: 'short' })
const fmtWeekday = new Intl.DateTimeFormat('en-IE', { weekday: 'short' })

function periodLabel(period: Period, from: Date): string {
  if (period === 'day') return fmtDay.format(from)
  if (period === 'week') {
    const end = shift('day', shift('week', from, 1), -1)
    return `${fmtShort.format(from)} to ${fmtShort.format(end)} ${end.getFullYear()}`
  }
  if (period === 'month') return fmtMonth.format(from)
  return String(from.getFullYear())
}

/** "Dress x2, Jacket" -> [["Dress", 2], ["Jacket", 1]] */
const garmentsOf = (label: string): [string, number][] =>
  label
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const m = g.match(/^(.*?)\s+x(\d+)$/)
      return m ? [m[1], Number(m[2])] : [g, 1]
    })

function computeStats(jobs: JobSummary[], from: Date, to: Date) {
  const inRange = (iso: string | null) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= from.getTime() && t < to.getTime()
  }
  const live = jobs.filter((j) => j.status !== 'cancelled')
  const jobsIn = live.filter((j) => inRange(j.created_at))
  const collected = live.filter((j) => j.status === 'collected' && inRange(j.collected_at))
  const sum = (list: JobSummary[], key: 'total_price' | 'balance_due') => list.reduce((t, j) => t + (j[key] || 0), 0)

  const types = new Map<string, number>()
  for (const j of jobsIn) for (const [g, n] of garmentsOf(j.items_label || '')) types.set(g, (types.get(g) ?? 0) + n)

  const customers = new Map<number, { customer: CustomerMini; jobs: number; spend: number }>()
  for (const j of jobsIn) {
    if (!j.customer) continue
    const c = customers.get(j.customer.id) ?? { customer: j.customer, jobs: 0, spend: 0 }
    c.jobs += 1
    c.spend += j.total_price || 0
    customers.set(j.customer.id, c)
  }

  const booked = sum(jobsIn, 'total_price')
  return {
    jobsIn,
    jobCount: jobsIn.length,
    booked,
    earnings: sum(collected, 'total_price'),
    collectedCount: collected.length,
    avg: jobsIn.length ? booked / jobsIn.length : 0,
    owed: sum(jobsIn, 'balance_due'),
    topTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topCustomers: [...customers.values()].sort((a, b) => b.spend - a.spend || b.jobs - a.jobs).slice(0, 5),
  }
}

/** Bars for the chart: one per day, or one per month for a year or a long date range */
function buckets(period: Period, from: Date, to: Date, jobsIn: JobSummary[]) {
  const out: { label: string; count: number }[] = []
  if (period === 'day') return out
  const days = daysBetween(from, to)

  if (period === 'year' || days > 62) {
    const keys: string[] = []
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d.setMonth(d.getMonth() + 1)) {
      keys.push(`${d.getFullYear()}-${d.getMonth()}`)
      out.push({ label: fmtMonthShort.format(d), count: 0 })
    }
    for (const j of jobsIn) {
      const d = new Date(j.created_at)
      const i = keys.indexOf(`${d.getFullYear()}-${d.getMonth()}`)
      if (i >= 0) out[i].count++
    }
    return out
  }

  for (let i = 0; i < days; i++) {
    const d = shift('day', from, i)
    const label = period === 'week' ? fmtWeekday.format(d) : period === 'month' ? String(d.getDate()) : fmtShort.format(d)
    out.push({ label, count: 0 })
  }
  for (const j of jobsIn) {
    const idx = daysBetween(from, startOf('day', new Date(j.created_at)))
    if (out[idx]) out[idx].count++
  }
  return out
}

function Card({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  )
}

function Delta({ now, before, prev, isMoney }: { now: number; before: number; prev: string; isMoney?: boolean }) {
  const diff = now - before
  if (diff === 0) return <span className="text-ink-faint">Same as {prev}</span>
  const amount = isMoney ? money(Math.abs(diff)) : Math.abs(diff)
  return (
    <span className={diff > 0 ? 'text-ready' : 'text-ink-soft'}>
      {diff > 0 ? '▲' : '▼'} {amount} vs {prev}
    </span>
  )
}

function TopList({ title, rows, empty }: { title: string; rows: { key: string | number; name: ReactNode; value: string; share: number }[]; empty: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-ink-soft">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.key} className="relative overflow-hidden rounded-lg px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-thread/10" style={{ width: `${Math.max(r.share * 100, 4)}%` }} aria-hidden />
              <div className="relative flex items-center gap-3">
                <span className="w-5 text-sm font-bold text-ink-faint tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate font-semibold">{r.name}</span>
                <span className="text-sm text-ink-soft tabular-nums">{r.value}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Trend({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const every = data.length > 12 ? Math.ceil(data.length / 7) : 1
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-lg font-bold">New jobs</h2>
      <div className="flex h-32 items-end gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${d.count} job${d.count === 1 ? '' : 's'}`}>
            <div className="w-full rounded-t bg-thread/70" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 1 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 overflow-visible text-center text-[11px] whitespace-nowrap text-ink-faint">
            {i % every === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </section>
  )
}

const dateInput = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm'

export default function Reports() {
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [rangeFrom, setRangeFrom] = useState(() => todayISO().slice(0, 8) + '01')
  const [rangeTo, setRangeTo] = useState(() => todayISO())
  const { data: jobs, error, isLoading } = useQuery({ queryKey: ['jobs', 'reports'], queryFn: fetchAllJobs })

  let from: Date
  let to: Date
  let prevFrom: Date
  if (period === 'range') {
    const a = parseDay(rangeFrom || todayISO())
    const b = parseDay(rangeTo || todayISO())
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    from = lo
    to = shift('day', hi, 1)
    prevFrom = shift('day', from, -daysBetween(from, to))
  } else {
    from = startOf(period, anchor)
    to = shift(period, from, 1)
    prevFrom = shift(period, from, -1)
  }

  const isCurrent = period !== 'range' && startOf(period, new Date()).getTime() === from.getTime()
  const prev = isCurrent || period === 'range' ? PERIODS.find((p) => p.key === period)!.prev : `previous ${period}`

  const stats = jobs ? computeStats(jobs, from, to) : null
  const before = jobs ? computeStats(jobs, prevFrom, from) : null

  // expenses use inclusive dates: from .. the day before `to`
  const expenseRange = (a: Date, b: Date) => `date_from=${toISO(a)}&date_to=${toISO(shift('day', b, -1))}`
  const { data: spent } = useQuery({
    queryKey: ['inventory', 'spend', toISO(from), toISO(to)],
    queryFn: () => api<SpendSummary>(`/api/inventory/spend?${expenseRange(from, to)}`),
  })
  const { data: spentBefore } = useQuery({
    queryKey: ['inventory', 'spend', toISO(prevFrom), toISO(from)],
    queryFn: () => api<SpendSummary>(`/api/inventory/spend?${expenseRange(prevFrom, from)}`),
  })
  const expenses = spent?.total ?? 0
  const profit = (stats?.earnings ?? 0) - expenses
  const profitBefore = (before?.earnings ?? 0) - (spentBefore?.total ?? 0)

  return (
    <div>
      <PageTitle sub="Earnings count jobs collected in the period. Expenses are inventory bought in the period. Profit is earnings minus expenses.">Reports</PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cx('h-9 rounded-md px-3 text-sm font-semibold', period === p.key ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'range' ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              From
              <input type="date" value={rangeFrom} max={rangeTo} onChange={(e) => setRangeFrom(e.target.value)} className={dateInput} />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              To
              <input type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)} className={dateInput} />
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous" onClick={() => setAnchor(shift(period, from, -1))} className="size-9 rounded-lg text-xl hover:bg-ink/5">
              ‹
            </button>
            <span className="min-w-44 text-center font-semibold">{periodLabel(period, from)}</span>
            <button type="button" aria-label="Next" disabled={isCurrent} onClick={() => setAnchor(shift(period, from, 1))} className="size-9 rounded-lg text-xl hover:bg-ink/5 disabled:opacity-30">
              ›
            </button>
            {!isCurrent && (
              <button type="button" onClick={() => setAnchor(new Date())} className="ml-2 text-sm font-semibold text-thread hover:underline">
                Back to today
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading && <Loading />}
      <ErrorBox error={error} />

      {stats && before && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card label="Total jobs" value={stats.jobCount}>
              <Delta now={stats.jobCount} before={before.jobCount} prev={prev} />
            </Card>
            <Card label="Total earnings" value={money(stats.earnings)}>
              <Delta now={stats.earnings} before={before.earnings} prev={prev} isMoney />
            </Card>
            <Card label="Expenses" value={money(expenses)}>
              <Link to="/inventory" className="text-ink-soft hover:underline">
                {spent?.count ?? 0} inventory purchase{spent?.count === 1 ? '' : 's'}
              </Link>
            </Card>
            <Card label="Profit" value={<span className={profit < 0 ? 'text-late' : undefined}>{money(profit)}</span>}>
              <Delta now={profit} before={profitBefore} prev={prev} isMoney />
            </Card>
            <Card label="Average job value" value={money(stats.avg)}>
              <span className="text-ink-soft">{money(stats.booked)} booked</span>
            </Card>
            <Card label="Still owed" value={money(stats.owed)}>
              <span className="text-ink-soft">{stats.collectedCount} job{stats.collectedCount === 1 ? '' : 's'} collected</span>
            </Card>
          </div>

          {(period !== 'range' || daysBetween(from, to) > 1) && <Trend data={buckets(period, from, to, stats.jobsIn)} />}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TopList
              title="Top 5 job types"
              empty="No jobs in this period."
              rows={stats.topTypes.map(([name, count]) => ({
                key: name,
                name,
                value: `${count} item${count === 1 ? '' : 's'}`,
                share: count / stats.topTypes[0][1],
              }))}
            />
            <TopList
              title="Top 5 customers"
              empty="No customers in this period."
              rows={stats.topCustomers.map((c) => ({
                key: c.customer.id,
                name: (
                  <Link to={`/customers/${c.customer.id}`} className="hover:underline">
                    {fullName(c.customer) || c.customer.phone_display}
                  </Link>
                ),
                value: `${money(c.spend)} · ${c.jobs} job${c.jobs === 1 ? '' : 's'}`,
                share: stats.topCustomers[0].spend ? c.spend / stats.topCustomers[0].spend : 1,
              }))}
            />
            <TopList
              title="Top spending (inventory)"
              empty="No stock bought in this period."
              rows={(spent?.by_category ?? []).slice(0, 5).map((c) => ({
                key: c.category,
                name: c.category,
                value: money(c.total),
                share: spent?.by_category[0].total ? c.total / spent.by_category[0].total : 1,
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}