import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { fullName } from '../lib/format'
import type { CustomerDetail } from '../lib/types'
import { Button, Checkbox, ErrorBox, Field, Input, Loading, PageTitle, Textarea } from '../components/ui'

const schema = z.object({
  first_name: z.string().trim().min(1, 'First name is needed'),
  last_name: z.string().trim(),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length >= 7, 'Enter a full phone number'),
  email: z.union([z.literal(''), z.email('That email looks wrong')]),
  notes: z.string(),
  tags: z.string(),
  sms_consent: z.boolean(),
  photo_consent: z.boolean(),
})
type FormValues = z.infer<typeof schema>

export default function CustomerForm() {
  const { id } = useParams()
  const editing = !!id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [duplicate, setDuplicate] = useState<{ message: string; customer_id: number } | null>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/api/customers/${id}`),
    enabled: editing,
  })

  const prefillName = (params.get('name') ?? '').trim().split(/\s+/)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: prefillName[0] ?? '',
      last_name: prefillName.slice(1).join(' '),
      phone: params.get('phone') ?? '',
      email: '',
      notes: '',
      tags: '',
      sms_consent: false,
      photo_consent: false,
    },
  })

  useEffect(() => {
    if (existing)
      reset({
        first_name: existing.first_name,
        last_name: existing.last_name,
        phone: existing.phone_display,
        email: existing.email ?? '',
        notes: existing.notes,
        tags: existing.tags,
        sms_consent: existing.sms_consent,
        photo_consent: existing.photo_consent,
      })
  }, [existing, reset])

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      editing
        ? api<CustomerDetail>(`/api/customers/${id}`, { method: 'PATCH', json: v })
        : api<CustomerDetail>('/api/customers', { method: 'POST', json: v }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.setQueryData(['customer', String(c.id)], c)
      if (!editing && params.get('then') === 'job') navigate(`/jobs/new?customer=${c.id}`, { replace: true })
      else navigate(`/customers/${c.id}`, { replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && typeof e.detail === 'object' && e.detail && 'customer_id' in e.detail) {
        setDuplicate(e.detail as { message: string; customer_id: number })
      }
    },
  })

  if (editing && isLoading) return <Loading />

  return (
    <div className="max-w-xl">
      <PageTitle>{editing ? `Edit ${fullName(existing)}` : 'New customer'}</PageTitle>
      <form onSubmit={handleSubmit((v) => (setDuplicate(null), save.mutate(v)))} className="space-y-4" noValidate>
        <Field label="Phone number" error={errors.phone?.message} hint="Used to find them next time">
          <Input inputMode="tel" autoComplete="off" autoFocus={!editing && !params.get('phone')} aria-invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.first_name?.message}>
            <Input autoComplete="off" autoFocus={!editing && !!params.get('phone')} aria-invalid={!!errors.first_name} {...register('first_name')} />
          </Field>
          <Field label="Last name">
            <Input autoComplete="off" {...register('last_name')} />
          </Field>
        </div>
        <Field label="Email (optional)" error={errors.email?.message}>
          <Input type="email" autoComplete="off" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Notes" hint="Fabric care, fit preferences, anything to remember">
          <Textarea {...register('notes')} />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. VIP, wedding party">
          <Input {...register('tags')} />
        </Field>
        <fieldset className="rounded-xl border border-line bg-surface px-4 py-2">
          <legend className="px-1 text-sm font-semibold text-ink-soft">Customer agreed to</legend>
          <Checkbox label="Get text / WhatsApp messages about offers and news" {...register('sms_consent')} />
          <Checkbox label="Have photos of their garment shown on the website" {...register('photo_consent')} />
          <p className="pb-2 text-sm text-ink-faint">"Your job is ready" messages are always sent, these are only for extras.</p>
        </fieldset>

        {duplicate ? (
          <div className="rounded-lg border border-late/30 bg-late-tint px-4 py-3 text-late">
            {duplicate.message}.{' '}
            <Link to={`/customers/${duplicate.customer_id}`} className="font-semibold underline">
              Open their record
            </Link>
          </div>
        ) : (
          <ErrorBox error={save.error} />
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" busy={save.isPending} size="lg">
            {editing ? 'Save changes' : params.get('then') === 'job' ? 'Save and start job' : 'Save customer'}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
