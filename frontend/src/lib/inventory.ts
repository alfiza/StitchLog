import type { PaymentMethod } from './types'

export type StockStatus = 'ok' | 'low' | 'out'

export type Section = 'shop' | 'beauty'

export interface InventoryItem {
  id: number
  section: Section
  name: string
  category: string
  supplier: string
  bought_on: string
  quantity: number
  quantity_left: number
  unit: string
  unit_price: number
  total_cost: number
  stock_value: number
  stock_status: StockStatus
  low_stock_at: number | null
  buy_url: string
  image_url: string
  payment_method: PaymentMethod | null
  notes: string
  receipt_url: string
  receipt_thumb_url: string
  created_at: string
}

export interface InventoryPage {
  items: InventoryItem[]
  total: number
  cost_total: number
}

export interface InventoryOverview {
  stock_value: number
  item_count: number
  low_count: number
  out_count: number
}

/** Money spent buying stock in a date range: the expenses figure in Reports */
export interface SpendSummary {
  date_from: string
  date_to: string
  total: number
  count: number
  by_category: { category: string; total: number; count: number }[]
}

export const DEFAULT_CATEGORIES = ['Thread', 'Zips', 'Buttons', 'Fabric', 'Elastic', 'Lining', 'Tools', 'Equipment', 'Packaging', 'Other']

export const UNITS = ['pcs', 'spools', 'metres', 'packs', 'rolls', 'boxes']

export const BEAUTY_CATEGORIES = [
  'Gel polish',
  'Builder gel',
  'Acrylic',
  'Base & top coat',
  'Nail tips',
  'Nail art',
  'Files & buffers',
  'Nail tools',
  'Brow tint',
  'Brow lamination',
  'Lash lift',
  'Wax',
  'Disposables',
  'Aftercare',
  'Other',
]

/** Each stock list: the alterations shop, and nails & brows (kept completely separate) */
export const SECTIONS: Record<Section, { path: string; title: string; sub: string; itemWord: string; categories: string[]; units: string[]; example: string }> = {
  shop: {
    path: '/inventory',
    title: 'Inventory',
    sub: 'Stock you buy for the shop. What you pay counts as expenses in Reports.',
    itemWord: 'item',
    categories: DEFAULT_CATEGORIES,
    units: UNITS,
    example: 'e.g. YKK zip 20cm black',
  },
  beauty: {
    path: '/nails-brows',
    title: 'Nails & Brows stock',
    sub: 'Stock for nails and brows. Kept separate from the alterations business.',
    itemWord: 'product',
    categories: BEAUTY_CATEGORIES,
    units: ['pcs', 'bottles', 'pots', 'packs', 'boxes', 'ml', 'g'],
    example: 'e.g. Gel polish, shade 042 nude',
  },
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  revolut: 'Revolut',
  other: 'Other',
}

/** 2.50 -> "2.5", 3 -> "3" */
export const qty = (n: number) => String(Number(n.toFixed(2)))

/** Date -> "2026-10-14" in local time */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
