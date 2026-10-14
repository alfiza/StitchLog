import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { addDaysISO, dayLabel, fullName, money } from '../lib/format'
import type { CustomerDetail, Job, Service, Settings } from '../lib/types'
import { Button, Checkbox, ErrorBox, Field, Input, Loading, PageTitle, Select, Textarea, cx } from '../components/ui'

const price = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), 'Use a number like 25 or 12.50')

const itemSchema = z.object({
  id: z.number().optional(),
  garment_type: z.string().min(1),
  colour: z.string(),
  details: z.string(),
  original_price: price,
  job_price: price,
})

const schema = z.object({
  due_date: z.string(),
  urgent: z.boolean(),
  deposit: price,
  paid: z.boolean(),
  payment_method: z.string(),
  notes: z.string(),
  items: z.array(itemSchema).min(1),
})
type FormValues = z.infer<typeof schema>
type ItemValues = FormValues['items'][number]

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')))
const emptyItem = (garment = 'Dress'): ItemValues => ({ garment_type: garment, colour: '', details: '', original_price: '', job_price: '' })

function Totals({ control }: { control: Control<FormValues> }) {
  const items = useWatch({ control, name: 'items' })
  const deposit = useWatch({ control, name: 'deposit' })
  const paid = useWatch({ control, name: 'paid' })
  const total = items.reduce((s, i) => s + (num(i.job_price) || 0), 0)
  const balance = paid ? 0 : Math.max(total - (num(deposit) || 0), 0)
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-xl bg-ink px-4 py-3 text-white">
      <span>
        Total <b className="font-display text-xl tabular-nums">{money(total)}</b>
      </span>
      <span className={cx('tabular-nums', balance > 0 ? 'text-tape' : 'text-white/70')}>
        {total === 0 ? 'Add prices above' : balance > 0 ? `${money(balance)} to pay on pickup` : 'Paid in full'}
      </span>
    </div>
  )
}

function DueQuickPick({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const opts = [
    ['Tomorrow', 1],
    ['3 days', 3],
    ['1 week', 7],
    ['2 weeks', 14],
  ] as const
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {opts.map(([label, days]) => {
        const iso = addDaysISO(days)
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(iso)}
            className={cx('h-9 rounded-full border px-3 text-sm', value === iso ? 'border-thread bg-thread-tint text-thread' : 'border-line bg-surface hover:border-thread')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default function JobForm() {
  const { id } = useParams()
  const editing = !!id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api<Job>(`/api/jobs/${id}`),
    enabled: editing,
  })
  const customerId = editing ? job?.customer?.id : Number(params.get('customer'))
  const { data: customer } = useQuery({
    queryKey: ['customer', String(customerId)],
    queryFn: () => api<CustomerDetail>(`/api/customers/${customerId}`),
    enabled: !!customerId,
  })
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/api/services') })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') })
  const garmentTypes = (settings?.garment_types ?? 'Dress,Trousers,Other').split(',').map((s) => s.trim()).filter(Boolean)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { due_date: addDaysISO(14), urgent: false, deposit: '', paid: false, payment_method: '', notes: '', items: [emptyItem()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const dueDate = useWatch({ control, name: 'due_date' })
  const [sendDetails, setSendDetails] = useState(true)

  useEffect(() => {
    if (job)
      reset({
        due_date: job.due_date ?? '',
        urgent: job.urgent,
        deposit: job.deposit ? String(job.deposit) : '',
        paid: job.paid,
        payment_method: job.payment_method ?? '',
        notes: job.notes,
        items: job.items.map((i) => ({
          id: i.id,
          garment_type: i.garment_type,
          colour: i.colour,
          details: i.details,
          original_price: i.original_price != null ? String(i.original_price) : '',
          job_price: String(i.job_price),
        })),
      })
  }, [job, reset])

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        due_date: v.due_date || null,
        urgent: v.urgent,
        deposit: num(v.deposit),
        paid: v.paid,
        payment_method: v.payment_method || null,
        notes: v.notes,
        items: v.items.map((i) => ({
          ...(i.id && { id: i.id }),
          garment_type: i.garment_type,
          colour: i.colour.trim(),
          details: i.details.trim(),
          original_price: i.original_price.trim() ? num(i.original_price) : null,
          job_price: num(i.job_price),
        })),
      }
      return editing
        ? api<Job>(`/api/jobs/${id}`, { method: 'PATCH', json: body })
        : api<Job>('/api/jobs', { method: 'POST', json: { ...body, customer_id: customerId, notify: sendDetails } })
    },
    onSuccess: (saved) => {
      qc.setQueryData(['job', String(saved.id)], saved)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      navigate(editing ? `/jobs/${saved.id}` : `/jobs/${saved.id}?new=1`, { replace: true })
    },
  })

  function applyService(index: number, serviceId: string) {
    const s = services.find((x) => String(x.id) === serviceId)
    if (!s) return
    const item = getValues(`items.${index}`)
    if (s.garment_type) setValue(`items.${index}.garment_type`, s.garment_type)
    setValue(`items.${index}.details`, item.details ? `${item.details}\n${s.name}` : s.name)
    setValue(`items.${index}.job_price`, String(num(item.job_price) + s.price_from), { shouldDirty: true })
  }

  if (!editing && !customerId) return <Navigate to="/" replace />
  if (editing && jobLoading) return <Loading />

  return (
    <div className="max-w-2xl">
      <PageTitle
        sub={
          customer && (
            <Link to={`/customers/${customer.id}`} className="underline decoration-line underline-offset-4">
              {fullName(customer)}, {customer.phone_display}
            </Link>
          )
        }
      >
        {editing ? `Edit ${job?.job_number}` : 'New job'}
      </PageTitle>

      {customer && customer.measurements.length > 0 && (
        <details className="mb-6 rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer font-semibold">Saved measurements</summary>
          <p className="mt-2 text-ink-soft tabular-nums">{customer.measurements.map((m) => `${m.label} ${m.value}${m.unit}`).join(', ')}</p>
        </details>
      )}
      {customer?.notes && <p className="mb-6 rounded-xl border-l-4 border-tape bg-tape-tint px-4 py-3 whitespace-pre-line">{customer.notes}</p>}

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6" noValidate>
        <div className="space-y-4">
          {fields.map((f, i) => (
            <fieldset key={f.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <legend className="font-display text-lg font-semibold">Item {i + 1}</legend>
                {fields.length > 1 && (
                  <Button type="button" variant="remove" size="sm" onClick={() => remove(i)}>
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Garment">
                  <Select {...register(`items.${i}.garment_type`)}>
                    {garmentTypes.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                    {!garmentTypes.includes(getValues(`items.${i}.garment_type`)) && <option>{getValues(`items.${i}.garment_type`)}</option>}
                  </Select>
                </Field>
                <Field label="Colour">
                  <Input placeholder="e.g. navy" {...register(`items.${i}.colour`)} />
                </Field>
              </div>
              {services.length > 0 && (
                <Field label="Add from price list" className="mt-3">
                  <Select value="" onChange={(e) => applyService(i, e.target.value)}>
                    <option value="">Pick a service to add it…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({money(s.price_from)})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="What needs doing" className="mt-3">
                <Textarea placeholder="e.g. Take in waist 2cm, shorten hem to knee" {...register(`items.${i}.details`)} />
              </Field>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Job price €" error={errors.items?.[i]?.job_price?.message}>
                  <Input inputMode="decimal" placeholder="0" aria-invalid={!!errors.items?.[i]?.job_price} {...register(`items.${i}.job_price`)} />
                </Field>
                <Field label="Garment cost € (optional)" error={errors.items?.[i]?.original_price?.message} hint="What the dress cost, for your records">
                  <Input inputMode="decimal" placeholder="" {...register(`items.${i}.original_price`)} />
                </Field>
              </div>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" className="w-full border-dashed" onClick={() => append(emptyItem(getValues(`items.${fields.length - 1}.garment_type`)))}>
            + Add another item
          </Button>
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <Field label="Due date" hint={dueDate ? dayLabel(dueDate) : 'No due date'}>
            <Input type="date" {...register('due_date')} />
            <DueQuickPick value={dueDate} onPick={(v) => setValue('due_date', v)} />
          </Field>
          <Checkbox label="Urgent / express" {...register('urgent')} />
        </div>

        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deposit paid €" error={errors.deposit?.message}>
              <Input inputMode="decimal" placeholder="0" {...register('deposit')} />
            </Field>
            <Field label="Paid by">
              <Select {...register('payment_method')}>
                <option value="">Not paid yet</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="revolut">Revolut</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <Checkbox label="Paid in full" {...register('paid')} />
          <Totals control={control} />
        </div>

        <Field label="Notes for this job">
          <Textarea placeholder="Fitting needed, fabric is delicate, etc." {...register('notes')} />
        </Field>

        {!editing && (
          <div className="rounded-xl border border-line bg-surface px-4 py-1">
            <Checkbox
              label={`Send the job details to ${customer?.first_name ?? 'the customer'} (items, prices, ready date and job link)`}
              checked={sendDetails}
              onChange={(e) => setSendDetails(e.target.checked)}
            />
          </div>
        )}

        <ErrorBox error={save.error} />
        <div className="flex gap-3">
          <Button type="submit" size="lg" busy={save.isPending}>
            {editing ? 'Save changes' : 'Create job'}
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
