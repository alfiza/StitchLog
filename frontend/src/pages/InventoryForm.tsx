import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ErrorBox, Field, Input, Loading, PageTitle, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { compressImage } from '../lib/compress'
import { money, todayISO } from '../lib/format'
import { PAYMENT_LABEL, SECTIONS, qty, type InventoryItem, type Section } from '../lib/inventory'
import type { PaymentMethod } from '../lib/types'

const NEW_CATEGORY = '__new__'

type FormState = {
  name: string
  category: string
  newCategory: string
  supplier: string
  bought_on: string
  quantity: string
  quantity_left: string
  unit: string
  unit_price: string
  low_stock_at: string
  buy_url: string
  image_url: string
  payment_method: string
  notes: string
}

const blank = (category: string): FormState => ({
  name: '',
  category,
  newCategory: '',
  supplier: '',
  bought_on: todayISO(),
  quantity: '1',
  quantity_left: '',
  unit: 'pcs',
  unit_price: '',
  low_stock_at: '',
  buy_url: '',
  image_url: '',
  payment_method: 'card',
  notes: '',
})

const num = (v: string) => Number(v.replace(',', '.'))

export default function InventoryForm({ section = 'shop' }: { section?: Section }) {
  const cfg = SECTIONS[section]
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(() => blank(cfg.categories[0]))
  const [receipt, setReceipt] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [formError, setFormError] = useState('')

  const { data: existing, isLoading } = useQuery({
    queryKey: ['inventory', 'item', id],
    queryFn: () => api<InventoryItem>(`/api/inventory/${id}`),
    enabled: editing,
  })
  const { data: used } = useQuery({ queryKey: ['inventory', section, 'categories'], queryFn: () => api<string[]>(`/api/inventory/categories?section=${section}`) })
  const categories = [...new Set([...cfg.categories, ...(used ?? [])])]
  const units = [...new Set([...cfg.units, form.unit].filter(Boolean))]

  useEffect(() => {
    if (existing)
      setForm({
        name: existing.name,
        category: existing.category,
        newCategory: '',
        supplier: existing.supplier,
        bought_on: existing.bought_on,
        quantity: qty(existing.quantity),
        quantity_left: qty(existing.quantity_left),
        unit: existing.unit,
        unit_price: String(existing.unit_price),
        low_stock_at: existing.low_stock_at == null ? '' : qty(existing.low_stock_at),
        buy_url: existing.buy_url ?? '',
        image_url: existing.image_url ?? '',
        payment_method: existing.payment_method ?? '',
        notes: existing.notes,
      })
  }, [existing])

  useEffect(() => {
    if (!receipt) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(receipt)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [receipt])

  const f = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((v) => ({ ...v, [key]: e.target.value })),
  })

  const quantity = num(form.quantity)
  const price = num(form.unit_price || '0')
  const total = Number.isFinite(quantity * price) ? quantity * price : 0

  const refresh = () => qc.invalidateQueries({ queryKey: ['inventory'] })

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        section,
        name: form.name.trim(),
        category: (form.category === NEW_CATEGORY ? form.newCategory : form.category).trim() || 'Other',
        supplier: form.supplier.trim(),
        bought_on: form.bought_on,
        quantity,
        quantity_left: editing && form.quantity_left !== '' ? num(form.quantity_left) : null,
        unit: form.unit || 'pcs',
        unit_price: price,
        low_stock_at: form.low_stock_at.trim() === '' ? null : num(form.low_stock_at),
        buy_url: form.buy_url.trim(),
        image_url: form.image_url.trim(),
        payment_method: (form.payment_method || null) as PaymentMethod | null,
        notes: form.notes,
      }
      let saved = editing
        ? await api<InventoryItem>(`/api/inventory/${id}`, { method: 'PUT', json: body })
        : await api<InventoryItem>('/api/inventory', { method: 'POST', json: body })
      if (receipt) {
        const fd = new FormData()
        fd.append('file', await compressImage(receipt))
        saved = await api<InventoryItem>(`/api/inventory/${saved.id}/receipt`, { method: 'POST', body: fd })
      }
      return saved
    },
    onSuccess: () => {
      refresh()
      navigate(cfg.path, { replace: true })
    },
  })

  const removeReceipt = useMutation({
    mutationFn: () => api<InventoryItem>(`/api/inventory/${id}/receipt`, { method: 'DELETE' }),
    onSuccess: (item) => {
      qc.setQueryData(['inventory', 'item', id], item)
      refresh()
    },
  })

  const remove = useMutation({
    mutationFn: () => api<void>(`/api/inventory/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh()
      navigate(cfg.path, { replace: true })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) return setFormError('Add the item name')
    if (!form.bought_on) return setFormError('Pick the date you bought it')
    if (!(quantity > 0)) return setFormError('Quantity bought must be more than 0')
    if (!Number.isFinite(price) || price < 0) return setFormError('Enter a valid price')
    if (editing && form.quantity_left !== '' && !(num(form.quantity_left) >= 0)) return setFormError('Quantity left must be 0 or more')
    if (form.low_stock_at.trim() !== '' && !(num(form.low_stock_at) >= 0)) return setFormError('Low stock alert must be 0 or more')
    if (form.category === NEW_CATEGORY && !form.newCategory.trim()) return setFormError('Type the new category name')
    save.mutate()
  }

  if (editing && isLoading) return <Loading />

  const currentReceipt = preview || existing?.receipt_thumb_url || ''

  return (
    <div className="max-w-xl">
      <PageTitle>{editing ? `Edit ${cfg.itemWord}` : `Add ${cfg.itemWord}`}</PageTitle>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={section === 'beauty' ? 'Product' : 'Item'}>
          <Input autoFocus={!editing} placeholder={cfg.example} {...f('name')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select {...f('category')}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ New category</option>
            </Select>
          </Field>
          <Field label="Date bought">
            <Input type="date" max={todayISO()} {...f('bought_on')} />
          </Field>
        </div>
        {form.category === NEW_CATEGORY && (
          <Field label="New category name">
            <Input autoFocus placeholder="e.g. Interfacing" {...f('newCategory')} />
          </Field>
        )}

        <Field label="Supplier / shop" hint="Where you bought it">
          <Input placeholder="e.g. Hickeys, Amazon" {...f('supplier')} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity bought">
            <Input inputMode="decimal" {...f('quantity')} />
          </Field>
          <Field label="Unit">
            <Select {...f('unit')}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Price per ${form.unit || 'item'} (€)`}>
            <Input inputMode="decimal" placeholder="0.00" {...f('unit_price')} />
          </Field>
        </div>
        <p className="rounded-lg bg-thread-tint px-4 py-2 font-semibold text-thread">
          Total cost: <span className="tabular-nums">{money(total)}</span>
          {section === 'shop' && <span className="ml-2 text-sm font-normal">counts as an expense on the date bought</span>}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {editing && (
            <Field label="Quantity left" hint="What's still on the shelf">
              <Input inputMode="decimal" {...f('quantity_left')} />
            </Field>
          )}
          <Field label="Low stock alert at" hint="Leave empty for no alert" className={editing ? '' : 'col-span-2 sm:col-span-1'}>
            <Input inputMode="decimal" placeholder="e.g. 3" {...f('low_stock_at')} />
          </Field>
        </div>

        <Field label="Buy link (optional)" hint="Web page to buy it again, e.g. the cheapest shop">
          <div className="flex gap-2">
            <Input type="url" inputMode="url" placeholder="https://…" {...f('buy_url')} />
            {form.buy_url.trim() && (
              <a
                href={/^https?:\/\//i.test(form.buy_url.trim()) ? form.buy_url.trim() : `https://${form.buy_url.trim()}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 shrink-0 items-center rounded-lg border border-line bg-surface px-4 font-semibold text-thread hover:border-thread"
              >
                Open
              </a>
            )}
          </div>
        </Field>

        <Field label="Product picture link (optional)" hint="Picture from the shop's website. Right-click the photo there, 'Copy image address', paste here">
          <div className="flex items-center gap-3">
            <Input type="url" inputMode="url" placeholder="https://…/photo.jpg" {...f('image_url')} />
            {form.image_url.trim() && <img src={form.image_url.trim()} alt="" className="size-11 shrink-0 rounded-lg border border-line bg-white object-contain" />}
          </div>
        </Field>

        <Field label="Paid by">
          <Select {...f('payment_method')}>
            <option value="">Not set</option>
            {Object.entries(PAYMENT_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes">
          <Textarea {...f('notes')} />
        </Field>

        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 text-sm font-semibold text-ink-soft">Receipt photo (optional)</div>
          {currentReceipt ? (
            <div className="flex items-center gap-4">
              <a href={preview || existing?.receipt_url} target="_blank" rel="noreferrer">
                <img src={currentReceipt} alt="Receipt" className="h-24 w-24 rounded-lg object-cover" />
              </a>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                  Replace
                </Button>
                <Button type="button" variant="remove" size="sm" busy={removeReceipt.isPending} onClick={() => (preview ? setReceipt(null) : removeReceipt.mutate())}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
              Add receipt photo
            </Button>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
        </div>

        {formError && <p className="rounded-lg border border-late/30 bg-late-tint px-4 py-3 text-late">{formError}</p>}
        <ErrorBox error={save.error || remove.error || removeReceipt.error} />

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" busy={save.isPending} size="lg">
            {editing ? 'Save changes' : `Save ${cfg.itemWord}`}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          {editing && (
            <Button type="button" variant="danger" size="lg" className="ml-auto" busy={remove.isPending} onClick={() => window.confirm(`Delete this ${cfg.itemWord}?`) && remove.mutate()}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
