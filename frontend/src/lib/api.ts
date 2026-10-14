const TOKEN_KEY = 'stitchlog.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: stay logged in for this tab only */
  }
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = d.loc?.filter((x) => x !== 'body').join(' ')
        return field ? `${field}: ${d.msg?.replace(/^Value error, /, '')}` : d.msg
      })
      .join('. ')
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: string }).message)
  if (status === 0) return 'Could not reach the server. Check the internet connection.'
  return `Something went wrong (error ${status})`
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let body = options.body
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  }
  let res: Response
  try {
    res = await fetch(path, { ...options, headers, body })
  } catch {
    throw new ApiError(0, messageFrom(null, 0), null)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/public')) {
      setToken(null)
      onUnauthorized()
    }
    const detail = data?.detail ?? null
    throw new ApiError(res.status, messageFrom(detail, res.status), detail)
  }
  return data as T
}
