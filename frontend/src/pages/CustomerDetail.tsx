import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fullDate, fullName } from '../lib/format'
import type { CustomerDetail as Customer, Measurement } from '../lib/types'
import { Button, ButtonLink, ErrorBox, Input, JobList, Loading, PageTitle, Section } from '../components/ui'

const COMMON = ['Bust', 'Waist', 'Hips', 'Shoulder', 'Sleeve', 'Length', 'Inseam', 'Neck']

type Row = { label: string; value: string; unit: string }

function Measurements({ customer }: { customer: Customer }) {
  const qc = useQueryClient()
  const toRows = (m: Measurement[]): Row[] => m.map((x) => ({ label: x.label, value: String(x.value), unit: x.unit }))
  const [rows, setRows] = useState<Row[]>(() => toRows(customer.measurements))
  const [editing, setEditing] = useState(false)

  useEffect(() => setRows(toRows(customer.measurements)), [customer.measurements])

  const save = useMutation({
    mutationFn: () =>
      api<Measurement[]>(`/api/customers/${customer.id}/measurements`, {
        method: 'PUT',
        json: rows.filter((r) => r.label.trim() && r.value.trim()).map((r) => ({ label: r.label.trim(), value: Number(r.value), unit: r.unit })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', String(customer.id)] })
      setEditing(false)
    },
  })

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const unused = COMMON.filter((c) => !rows.some((r) => r.label.toLowerCase() === c.toLowerCase()))

  if (!editing) {
    return (
      <Section title="Measurements" action={<Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{customer.measurements.length ? 'Edit' : 'Add'}</Button>}>
        {customer.measurements.length === 0 ? (
          <p className="text-ink-soft">None saved yet. Saved measurements are reused on every future job.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {customer.measurements.map((m) => (
              <div key={m.id} className="border-b border-dashed border-line pb-1">
                <dt className="text-sm text-ink-soft">{m.label}</dt>
                <dd className="font-display text-lg font-semibold tabular-nums">
                  {m.value} <span className="text-sm font-normal text-ink-faint">{m.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
    )
  }

  return (
    <Section title="Measurements">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label="Measurement" placeholder="e.g. Waist" value={r.label} onChange={(e) => set(i, { label: e.target.value })} className="flex-1" />
            <Input aria-label="Value" inputMode="decimal" placeholder="0" value={r.value} onChange={(e) => set(i, { value: e.target.value.replace(',', '.') })} className="w-24" />
            <select aria-label="Unit" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} className="h-11 rounded-lg border border-line bg-surface px-2">
              <option>cm</option>
              <option>in</option>
            </select>
            <Button variant="ghost" aria-label={`Remove ${r.label || 'row'}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {unused.map((label) => (
          <button key={label} type="button" onClick={() => setRows((r) => [...r, { label, value: '', unit: 'cm' }])} className="h-9 rounded-full border border-line bg-surface px-3 text-sm hover:border-thread">
            + {label}
          </button>
        ))}
        <button type="button" onClick={() => setRows((r) => [...r, { label: '', value: '', unit: 'cm' }])} className="h-9 rounded-full border border-dashed border-line px-3 text-sm hover:border-thread">
          + Other
        </button>
      </div>
      <ErrorBox error={save.error} />
      <div className="mt-4 flex gap-3">
        <Button busy={save.isPending} onClick={() => save.mutate()}>
          Save measurements
        </Button>
        <Button variant="ghost" onClick={() => (setRows(toRows(customer.measurements)), setEditing(false))}>
          Cancel
        </Button>
      </div>
    </Section>
  )
}

function DeleteCustomer({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => api(`/api/customers/${customer.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/customers', { replace: true })
    },
  })
  if (!open)
    return (
      <Button variant="remove" size="sm" onClick={() => setOpen(true)}>
        Delete customer and all their data
      </Button>
    )
  return (
    <div className="rounded-xl border border-late/30 bg-late-tint p-4">
      <p className="mb-3">
        This permanently deletes {customer.first_name}, all {customer.jobs.length} jobs, photos, reviews and messages. Use this when a customer asks you to remove their data. Type <b>delete</b> to confirm.
      </p>
      <div className="flex gap-2">
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-40" aria-label="Type delete to confirm" />
        <Button variant="danger" disabled={typed.trim().toLowerCase() !== 'delete'} busy={del.isPending} onClick={() => del.mutate()}>
          Delete forever
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ErrorBox error={del.error} />
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const { data: c, error, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<Customer>(`/api/customers/${id}`),
  })
  if (isLoading) return <Loading />
  if (error || !c) return <ErrorBox error={error ?? 'Customer not found'} />

  const wa = c.phone.replace('+', '')
  return (
    <div>
      <PageTitle
        sub={
          <span className="tabular-nums">
            <a href={`tel:${c.phone}`} className="underline decoration-line underline-offset-4 hover:decoration-thread">
              {c.phone_display}
            </a>
            {c.email && <span className="ml-3">{c.email}</span>}
          </span>
        }
        action={<ButtonLink to={`/jobs/new?customer=${c.id}`}>New job</ButtonLink>}
      >
        {fullName(c)}
      </PageTitle>

      <div className="-mt-2 mb-6 flex flex-wrap gap-2">
        <ButtonLink to={`/customers/${c.id}/edit`} variant="secondary" className="h-9 text-sm">
          Edit details
        </ButtonLink>
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:border-ink-faint">
          WhatsApp
        </a>
        {c.tags &&
          c.tags.split(',').map((t) => (
            <span key={t} className="inline-flex h-9 items-center rounded-lg bg-thread-tint px-3 text-sm text-thread">
              {t.trim()}
            </span>
          ))}
      </div>

      {c.notes && <p className="mb-8 rounded-xl border-l-4 border-tape bg-tape-tint px-4 py-3 whitespace-pre-line">{c.notes}</p>}

      <Section title="Jobs" count={c.jobs.length}>
        <JobList jobs={c.jobs} showCustomer={false} empty="No jobs yet. Start one with New job." />
      </Section>

      <Measurements customer={c} />

      <section className="mt-12 border-t border-line pt-6 text-sm text-ink-soft">
        <p className="mb-3">
          Customer since {fullDate(c.created_at)}
          {c.source && ` (imported from ${c.source})`}. Offers by message: {c.sms_consent ? 'yes' : 'no'}. Photos on website: {c.photo_consent ? 'yes' : 'no'}.
        </p>
        <DeleteCustomer customer={c} />
      </section>
    </div>
  )
}
