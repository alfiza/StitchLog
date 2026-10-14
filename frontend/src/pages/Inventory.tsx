import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ButtonLink, Empty, ErrorBox, Input, Loading, PageTitle, Select, cx } from '../components/ui'
import { api } from '../lib/api'
import { money, parseDay, todayISO } from '../lib/format'
import { SECTIONS, qty, type InventoryItem, type Section, type InventoryOverview, type InventoryPage, type SpendSummary } from '../lib/inventory'

const STOCK_TABS = [
  { key: '', label: 'All' },
  { key: 'in', label: 'In stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'out', label: 'Out of stock' },
]

const fmtDate = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtMonth = new Intl.DateTimeFormat('en-IE', { month: 'long' })

function Stat({ label, value, sub, onClick, active, tone }: { label: string; value: string | number; sub?: string; onClick?: () => void; active?: boolean; tone?: 'late' | 'tape' }) {
  const body = (
    <>
      <div className="text-sm text-ink-soft">{label}</div>
      <div className={cx('mt-1 font-display text-2xl font-bold tabular-nums', tone === 'late' && value !== 0 && 'text-late')}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-faint">{sub}</div>}
    </>
  )
  const cls = cx('rounded-xl border bg-surface p-4 text-left', active ? 'border-thread ring-2 ring-thread/20' : 'border-line')
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, 'hover:border-ink-faint')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const statusBadge: Record<InventoryItem['stock_status'], string> = {
  ok: '',
  low: 'bg-tape-tint text-ink',
  out: 'bg-late-tint text-late',
}

export default function Inventory({ section = 'shop' }: { section?: Section }) {
  const cfg = SECTIONS[section]
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const stock = params.get('stock') ?? ''
  const [text, setText] = useState(q)

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) set({ q: text })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q])

  const { data, error, isLoading } = useQuery({
    queryKey: ['inventory', section, 'list', q, category, stock],
    queryFn: () =>
      api<InventoryPage>(
        `/api/inventory?section=${section}&limit=500&q=${encodeURIComponent(q)}${category ? `&category=${encodeURIComponent(category)}` : ''}${stock ? `&stock=${stock}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  })
  const { data: overview } = useQuery({ queryKey: ['inventory', section, 'overview'], queryFn: () => api<InventoryOverview>(`/api/inventory/overview?section=${section}`) })

  const today = todayISO()
  const monthStart = today.slice(0, 8) + '01'
  const { data: spent } = useQuery({
    queryKey: ['inventory', section, 'spend', monthStart, today],
    queryFn: () => api<SpendSummary>(`/api/inventory/spend?section=${section}&date_from=${monthStart}&date_to=${today}`),
  })

  const { data: used } = useQuery({ queryKey: ['inventory', section, 'categories'], queryFn: () => api<string[]>(`/api/inventory/categories?section=${section}`) })
  const categories = [...new Set([...cfg.categories, ...(used ?? [])])]

  const adjust = useMutation({
    mutationFn: ({ id, change }: { id: number; change: number }) => api<InventoryItem>(`/api/inventory/${id}/stock`, { method: 'POST', json: { change } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  return (
    <div>
      <PageTitle action={<ButtonLink to={`${cfg.path}/new`}>Add {cfg.itemWord}</ButtonLink>} sub={cfg.sub}>
        {cfg.title}
      </PageTitle>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stock value" value={money(overview?.stock_value ?? 0)} sub={`${overview?.item_count ?? 0} ${cfg.itemWord}s`} />
        <Stat label={`Spent in ${fmtMonth.format(parseDay(today))}`} value={money(spent?.total ?? 0)} sub={`${spent?.count ?? 0} purchases`} />
        <Stat label="Low stock" value={overview?.low_count ?? 0} tone="tape" onClick={() => set({ stock: stock === 'low' ? '' : 'low' })} active={stock === 'low'} />
        <Stat label="Out of stock" value={overview?.out_count ?? 0} tone="late" onClick={() => set({ stock: stock === 'out' ? '' : 'out' })} active={stock === 'out'} />
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_14rem]">
        <Input type="search" placeholder="Search item, supplier or notes" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search inventory" />
        <Select value={category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STOCK_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => set({ stock: t.key })}
            className={cx('h-9 rounded-full border px-4 text-sm font-semibold', stock === t.key ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-soft hover:border-ink-faint')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBox error={error || adjust.error} />
      {isLoading && <Loading />}
      {data && data.items.length === 0 && <Empty>{q || category || stock ? 'Nothing matches.' : `No stock yet. Add the first ${cfg.itemWord} you bought.`}</Empty>}
      {data && data.items.length > 0 && (
        <ul className="rounded-xl border border-line bg-surface px-2">
          {data.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 border-b border-line px-1 py-3 last:border-b-0 md:px-3">
              <Link to={`${cfg.path}/${i.id}/edit`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
                {i.image_url ? (
                  <img src={i.image_url} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg border border-line bg-white object-contain" />
                ) : i.receipt_thumb_url ? (
                  <img src={i.receipt_thumb_url} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tape-tint font-bold text-ink-soft">
                    {i.category.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {i.name}
                    {i.stock_status !== 'ok' && (
                      <span className={cx('ml-2 rounded px-1.5 py-0.5 text-xs font-bold', statusBadge[i.stock_status])}>{i.stock_status === 'low' ? 'Low' : 'Out'}</span>
                    )}
                  </div>
                  <div className="truncate text-sm text-ink-soft">
                    {i.category}
                    {i.supplier && ` · ${i.supplier}`} · {fmtDate.format(parseDay(i.bought_on))} · {money(i.unit_price)}/{i.unit}
                  </div>
                </div>
              </Link>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Use one ${i.name}`}
                  disabled={i.quantity_left <= 0 || adjust.isPending}
                  onClick={() => adjust.mutate({ id: i.id, change: -1 })}
                  className="size-8 rounded-lg border border-line text-lg leading-none hover:border-ink-faint disabled:opacity-30"
                >
                  −
                </button>
                <div className="w-20 text-center text-sm tabular-nums">
                  <div className="font-semibold">
                    {qty(i.quantity_left)} <span className="font-normal text-ink-faint">/ {qty(i.quantity)}</span>
                  </div>
                  <div className="text-xs text-ink-faint">{i.unit} left</div>
                </div>
                <button
                  type="button"
                  aria-label={`Add one ${i.name}`}
                  disabled={adjust.isPending}
                  onClick={() => adjust.mutate({ id: i.id, change: 1 })}
                  className="size-8 rounded-lg border border-line text-lg leading-none hover:border-ink-faint disabled:opacity-30"
                >
                  +
                </button>
              </div>

              {i.buy_url ? (
                <a
                  href={i.buy_url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Buy ${i.name}`}
                  className="hidden h-8 shrink-0 items-center rounded-lg border border-line px-3 text-sm font-semibold text-thread hover:border-thread sm:inline-flex"
                >
                  Buy
                </a>
              ) : (
                <span className="hidden w-[52px] sm:block" />
              )}

              <div className="hidden w-20 shrink-0 text-right sm:block">
                <div className="font-semibold tabular-nums">{money(i.total_cost)}</div>
                <div className="text-xs text-ink-faint">cost</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.items.length > 0 && (
        <p className="mt-3 text-right text-sm text-ink-soft">
          {data.total} {cfg.itemWord}{data.total === 1 ? '' : 's'}, cost <span className="font-semibold tabular-nums">{money(data.cost_total)}</span>
        </p>
      )}
    </div>
  )
}
