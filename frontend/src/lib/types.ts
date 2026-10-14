export type JobStatus = 'received' | 'in_progress' | 'ready' | 'collected' | 'cancelled'
export type PhotoType = 'before' | 'after'
export type PaymentMethod = 'cash' | 'card' | 'revolut' | 'other'

export interface User {
  id: number
  email: string
  name: string
}

export interface CustomerMini {
  id: number
  first_name: string
  last_name: string
  phone: string
  phone_display: string
}

export interface Customer extends CustomerMini {
  email: string | null
  notes: string
  tags: string
  sms_consent: boolean
  photo_consent: boolean
  source: string
  created_at: string
}

export interface CustomerListItem extends Customer {
  job_count: number
  open_jobs: number
  last_visit: string | null
}

export interface Measurement {
  id: number
  label: string
  value: number
  unit: string
  updated_at: string
}

export interface Photo {
  id: number
  type: PhotoType
  url: string
  thumb_url: string
  width: number
  height: number
  alt_text: string
}

export interface JobItem {
  id: number
  position: number
  garment_type: string
  colour: string
  details: string
  original_price: number | null
  job_price: number
  photos: Photo[]
}

export interface JobSummary {
  id: number
  job_number: string
  status: JobStatus
  due_date: string | null
  urgent: boolean
  paid: boolean
  deposit: number
  total_price: number
  balance_due: number
  created_at: string
  ready_at: string | null
  collected_at: string | null
  item_count: number
  items_label: string
  customer: CustomerMini | null
}

export interface Review {
  id: number
  rating: number
  comment: string
  show_on_website: boolean
  created_at: string
}

export interface Message {
  id: number
  kind: 'received' | 'ready'
  channel: string
  to: string
  body: string
  status: string
  error: string
  sent_at: string
}

export interface Job extends JobSummary {
  payment_method: PaymentMethod | null
  notes: string
  public_token: string
  public_url: string
  whatsapp_url: string
  whatsapp_received_url: string
  items: JobItem[]
  review: Review | null
  messages: Message[]
}

export interface CustomerDetail extends Customer {
  measurements: Measurement[]
  jobs: JobSummary[]
}

export interface Service {
  id: number
  name: string
  garment_type: string
  price_from: number
  description: string
  sort_order: number
  active: boolean
}

export interface Dashboard {
  today: string
  due_today: JobSummary[]
  overdue: JobSummary[]
  ready_not_collected: JobSummary[]
  in_progress_count: number
  received_count: number
  week_income: number
  week_jobs_in: number
  month_income: number
  recent_reviews: Review[]
  average_rating: number | null
  review_count: number
  customer_count: number
}

export interface Page<T> {
  items: T[]
  total: number
}

export type Settings = Record<string, string>

export interface PublicJob {
  job_number: string
  status: JobStatus
  first_name: string
  due_date: string | null
  created_at: string
  ready_at: string | null
  collected_at: string | null
  total_price: number
  balance_due: number
  paid: boolean
  items: {
    garment_type: string
    colour: string
    details: string
    job_price: number
    photos: { type: PhotoType; url: string; thumb_url: string; alt_text: string }[]
  }[]
  review: Review | null
  business: {
    name: string
    phone: string
    whatsapp: string
    address: string
    eircode: string
    opening_hours: string
    google_review_url: string
  }
}
