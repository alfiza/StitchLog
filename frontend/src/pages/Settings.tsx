import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import type { Service, Settings as SettingsT } from '../lib/types'
import { Button, Checkbox, ErrorBox, Field, Input, Loading, PageTitle, Textarea } from '../components/ui'

/** Back link + title used by every settings page */
function SubPage({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <Link to="/settings" className="mb-3 inline-flex h-9 items-center gap-1 md:hidden rounded-lg pr-2 font-semibold text-thread hover:underline">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Settings
      </Link>
      <PageTitle sub={sub}>{title}</PageTitle>
      {children}
    </div>
  )
}

/** Loads the business settings and saves only the fields this page owns */
function useSettingsForm(keys: string[]) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsT>('/api/settings') })
  const [form, setForm] = useState<SettingsT>({})
  const [saved, setSaved] = useState(false)
  useEffect(() => data && setForm(data), [data])
  const save = useMutation({
    mutationFn: () => api<SettingsT>('/api/settings', { method: 'PUT', json: Object.fromEntries(keys.map((k) => [k, form[k] ?? ''])) }),
    onSuccess: (d) => {
      qc.setQueryData(['settings'], d)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })
  const f = (key: string) => ({
    value: form[key] ?? '',
    onChange: (e: { target: { value: string } }) => {
      setSaved(false)
      setForm((v) => ({ ...v, [key]: e.target.value }))
    },
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return { form, f, save, saved, isLoading, onSubmit }
}

function SaveBar({ busy, saved, error }: { busy: boolean; saved: boolean; error: unknown }) {
  return (
    <div className="mt-6 mb-10 space-y-3">
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" busy={busy}>
          Save
        </Button>
        {saved && <span className="font-semibold text-ready">Saved</span>}
      </div>
      <ErrorBox error={error} />
    </div>
  )
}

export function BusinessDetailsSettings() {
  const { f, save, saved, isLoading, onSubmit } = useSettingsForm([
    'business_name', 'phone', 'whatsapp', 'email', 'address', 'eircode', 'opening_hours', 'google_review_url',
  ])
  return (
    <SubPage title="Business details" sub="Shown in messages and on the customer's job page">
      {isLoading ? (
        <Loading />
      ) : (
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input {...f('business_name')} />
            </Field>
            <Field label="Phone">
              <Input inputMode="tel" {...f('phone')} />
            </Field>
            <Field label="WhatsApp number">
              <Input inputMode="tel" {...f('whatsapp')} />
            </Field>
            <Field label="Email">
              <Input type="email" {...f('email')} />
            </Field>
            <Field label="Address">
              <Input {...f('address')} />
            </Field>
            <Field label="Eircode">
              <Input {...f('eircode')} />
            </Field>
            <Field label="Opening hours" className="sm:col-span-2">
              <Textarea placeholder={'Mon to Fri 10:00 to 18:00\nSat 10:00 to 16:00'} {...f('opening_hours')} />
            </Field>
            <Field label="Google review link" hint="From your Google Business Profile, 'Ask for reviews'" className="sm:col-span-2">
              <Input type="url" placeholder="https://g.page/r/…/review" {...f('google_review_url')} />
            </Field>
          </div>
          <SaveBar busy={save.isPending} saved={saved} error={save.error} />
        </form>
      )}
    </SubPage>
  )
}

const SAMPLE_ITEMS = '- Dress (navy): Shorten hem to knee (€25.00)\n- Trousers: Take in waist 2cm (€15.00)'

export function ReadyMessageSettings() {
  const { form, f, save, saved, isLoading, onSubmit } = useSettingsForm(['received_message', 'ready_message'])
  const fill = (text: string) =>
    text
    .replaceAll('{first_name}', 'Aoife')
    .replaceAll('{last_name}', 'Byrne')
    .replaceAll('{business_name}', form.business_name || '')
    .replaceAll('{job_number}', 'SL-0042')
    .replaceAll('{balance}', '20.00')
    .replaceAll('{total}', '35.00')
    .replaceAll('{job_link}', 'https://…/j/abc123')
    .replaceAll('{review_link}', form.google_review_url || '')
    .replaceAll('{phone}', form.phone || '')
    .replaceAll('{paid}', '15.00')
    .replaceAll('{deposit}', '15.00')
    .replaceAll('{items}', SAMPLE_ITEMS)
    .replaceAll('{due_date}', 'Wed 28 Oct')
  const bubble = 'mt-1 max-w-md whitespace-pre-line rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-[15px] text-ink'
  return (
    <SubPage title="Customer messages" sub="What customers get on WhatsApp or text">
      {isLoading ? (
        <Loading />
      ) : (
        <form onSubmit={onSubmit}>
          <h2 className="mb-2 text-xl font-semibold">When you add a job</h2>
          <Field
            label="Job details message"
            hint="You can use {first_name}, {job_number}, {items}, {total}, {paid}, {deposit}, {balance}, {due_date}, {job_link}, {business_name}, {phone}"
          >
            <Textarea rows={7} {...f('received_message')} />
          </Field>
          <p className="mt-4 text-sm font-semibold text-ink-soft">Preview</p>
          <p className={bubble}>{fill(form.received_message ?? '')}</p>

          <h2 className="mt-10 mb-2 text-xl font-semibold">When the job is ready</h2>
          <Field label="Job ready message" hint="You can use {first_name}, {job_number}, {balance}, {total}, {job_link}, {review_link}, {business_name}, {phone}">
            <Textarea rows={5} {...f('ready_message')} />
          </Field>
          <p className="mt-4 text-sm font-semibold text-ink-soft">Preview</p>
          <p className={bubble}>{fill(form.ready_message ?? '')}</p>
          <SaveBar busy={save.isPending} saved={saved} error={save.error} />
        </form>
      )}
    </SubPage>
  )
}

export function GarmentTypesSettings() {
  const { form, f, save, saved, isLoading, onSubmit } = useSettingsForm(['garment_types'])
  const list = (form.garment_types ?? '').split(',').map((g) => g.trim()).filter(Boolean)
  return (
    <SubPage title="Garment types" sub="The choices in the Garment dropdown when you add a job">
      {isLoading ? (
        <Loading />
      ) : (
        <form onSubmit={onSubmit}>
          <Field label="Garment types" hint="Separate them with commas">
            <Textarea rows={4} {...f('garment_types')} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {list.map((g) => (
              <span key={g} className="rounded-full bg-thread-tint px-3 py-1 text-sm text-thread">
                {g}
              </span>
            ))}
          </div>
          <SaveBar busy={save.isPending} saved={saved} error={save.error} />
        </form>
      )}
    </SubPage>
  )
}

export function PriceListSettings() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['services', 'all'],
    queryFn: () => api<Service[]>('/api/services?include_inactive=true'),
  })
  const [draft, setDraft] = useState({ name: '', garment_type: '', price_from: '' })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['services'] })
  }
  const add = useMutation({
    mutationFn: () =>
      api('/api/services', {
        method: 'POST',
        json: { ...draft, price_from: Number(draft.price_from.replace(',', '.') || 0), sort_order: data.length },
      }),
    onSuccess: () => {
      setDraft({ name: '', garment_type: '', price_from: '' })
      refresh()
    },
  })
  const update = useMutation({
    mutationFn: (s: Service) => api(`/api/services/${s.id}`, { method: 'PUT', json: s }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/services/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })

  return (
    <SubPage title="Price list" sub="Pick these in the job form to fill in the work and price quickly. Later they'll show on your website too.">
      {isLoading && <Loading />}
      <ul className="mb-4 rounded-xl border border-line bg-surface px-2">
        {data.map((s) => (
          <li key={s.id} className="flex items-center gap-2 border-b border-line px-1 py-2 last:border-b-0">
            <div className={s.active ? 'min-w-0 flex-1' : 'min-w-0 flex-1 opacity-50'}>
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-sm text-ink-soft">{s.garment_type || 'Any garment'}</div>
            </div>
            <Input
              aria-label={`Price for ${s.name}`}
              inputMode="decimal"
              defaultValue={s.price_from}
              className="w-24 text-right tabular-nums"
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'))
                if (!Number.isNaN(v) && v !== s.price_from) update.mutate({ ...s, price_from: v })
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => update.mutate({ ...s, active: !s.active })}>
              {s.active ? 'Hide' : 'Show'}
            </Button>
            <Button variant="remove" size="sm" aria-label={`Delete ${s.name}`} onClick={() => confirm(`Delete "${s.name}"?`) && remove.mutate(s.id)}>
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[1fr_7rem] gap-2 sm:grid-cols-[1fr_10rem_7rem_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.name.trim()) add.mutate()
        }}
      >
        <Input placeholder="Service, e.g. Hem trousers" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="New service name" />
        <Input placeholder="Garment" value={draft.garment_type} onChange={(e) => setDraft({ ...draft, garment_type: e.target.value })} aria-label="Garment type" className="hidden sm:block" />
        <Input placeholder="€ from" inputMode="decimal" value={draft.price_from} onChange={(e) => setDraft({ ...draft, price_from: e.target.value })} aria-label="Starting price" />
        <Button type="submit" busy={add.isPending} variant="secondary" className="col-span-2 sm:col-span-1">
          Add service
        </Button>
      </form>
      <ErrorBox error={add.error || update.error || remove.error} />
      {data.length > 0 && <p className="mt-2 text-sm text-ink-faint">Prices are starting prices. Change one and tap elsewhere to save.</p>}
    </SubPage>
  )
}

export function PasswordSettings() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [show, setShow] = useState(false)
  const [problem, setProblem] = useState('')
  const change = useMutation({
    mutationFn: () => api('/api/auth/change-password', { method: 'POST', json: { current_password: current, new_password: next } }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirmNext('')
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    change.reset()
    if (next.length < 8) return setProblem('The new password needs at least 8 characters.')
    if (next !== confirmNext) return setProblem("The two new passwords don't match.")
    if (next === current) return setProblem('The new password is the same as the current one.')
    setProblem('')
    change.mutate()
  }

  const type = show ? 'text' : 'password'
  return (
    <SubPage title="Password" sub={`Logged in as ${user?.email ?? ''}`}>
      <form className="grid max-w-md gap-4" onSubmit={submit} noValidate>
        <Field label="Current password">
          <Input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Type the new password again">
          <Input type={type} autoComplete="new-password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} required />
        </Field>
        <Checkbox label="Show passwords" checked={show} onChange={(e) => setShow(e.target.checked)} />
        {problem && <p className="rounded-lg border border-late/30 bg-late-tint px-4 py-3 text-late">{problem}</p>}
        <ErrorBox error={change.error} />
        {change.isSuccess && <p className="rounded-lg bg-ready-tint px-4 py-3 font-semibold text-ready">Password changed. Use the new one next time you log in.</p>}
        <div className="flex gap-3">
          <Button type="submit" busy={change.isPending} disabled={!current || !next || !confirmNext}>
            Change password
          </Button>
        </div>
      </form>
    </SubPage>
  )
}

const PAGES = [
  { to: 'business', title: 'Business details', about: (v: SettingsT) => [v.business_name, v.phone, v.address].filter(Boolean).join(', ') || 'Name, phone, address, opening hours' },
  { to: 'message', title: 'Customer messages', about: () => 'Job details and job ready texts' },
  { to: 'garments', title: 'Garment types', about: (v: SettingsT) => `${(v.garment_types ?? '').split(',').filter((g) => g.trim()).length} types in the job form` },
  { to: 'prices', title: 'Price list', about: () => 'Services and starting prices' },
  { to: 'password', title: 'Password', about: () => 'Change your login password' },
]

export default function Settings() {
  const { logout } = useAuth()
  const { data = {} } = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsT>('/api/settings') })
  return (
    <div className="max-w-2xl">
      <PageTitle>Settings</PageTitle>
      <ul className="rounded-xl border border-line bg-surface">
        {PAGES.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="flex items-center gap-3 border-b border-line px-4 py-4 hover:bg-thread-tint/40">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.title}</div>
                <div className="truncate text-sm text-ink-soft">{p.about(data)}</div>
              </div>
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={logout} className="flex w-full items-center px-4 py-4 text-left font-semibold text-late hover:bg-late-tint">
            Log out
          </button>
        </li>
      </ul>
    </div>
  )
}
