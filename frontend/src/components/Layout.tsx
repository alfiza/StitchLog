import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { api } from '../lib/api'
import type { Settings } from '../lib/types'
import { cx } from './ui'

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
)

const settingsIcon = icon(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>)

const NAV = [
  { to: '/', label: 'Today', end: true, icon: icon(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>) },
  { to: '/customers', label: 'Customers', icon: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.6M18.5 14.4c1.2.8 1.8 2.4 2 4.6" /></>) },
  { to: '/jobs', label: 'Jobs', icon: icon(<><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><circle cx="12" cy="7.5" r="1.4" /><path d="M9 12h6M9 15.5h4" strokeDasharray="1.6 1.8" /></>) },
  { to: '/reports', label: 'Reports', icon: icon(<><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></>) },
  { to: '/inventory', label: 'Inventory', icon: icon(<><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>) },
  { to: '/nails-brows', label: 'Nails & Brows', icon: icon(<><path d="M9 21V11a3 3 0 0 1 6 0v10z" /><path d="M10 11V6.5a2 2 0 0 1 4 0V11M8 17h8" /></>) },
  { to: '/settings', label: 'Settings', icon: settingsIcon },
]

const SETTINGS_LINKS = [
  { to: '/settings/business', label: 'Business details' },
  { to: '/settings/message', label: 'Customer messages' },
  { to: '/settings/garments', label: 'Garment types' },
  { to: '/settings/prices', label: 'Price list' },
  { to: '/settings/password', label: 'Password' },
]

function SettingsToggle() {
  const { pathname } = useLocation()
  const inSettings = pathname.startsWith('/settings')
  const [open, setOpen] = useState(inSettings)

  useEffect(() => {
    if (inSettings) setOpen(true)
  }, [inSettings])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          'flex h-11 w-full items-center gap-3 rounded-lg px-3 font-semibold',
          inSettings ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white',
        )}
      >
        {settingsIcon}
        <span className="flex-1 text-left">Settings</span>
        <svg viewBox="0 0 24 24" className={cx('size-4 transition-transform', open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 ml-6 flex flex-col gap-0.5 border-l border-white/15 pl-3">
          {SETTINGS_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cx('rounded-md px-3 py-2 text-sm', isActive ? 'bg-white/12 font-semibold text-white' : 'text-white/60 hover:text-white')
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings'), staleTime: 300_000 })

  // On desktop the options live in the sidebar, so skip the list page
  useEffect(() => {
    if (pathname === '/settings' && window.matchMedia('(min-width: 768px)').matches) {
      navigate('/settings/business', { replace: true })
    }
  }, [pathname, navigate])

  return (
    <div className="min-h-dvh md:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink px-4 py-6 text-white md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img src="/favicon.svg" alt="StitchLog" className="size-10 shrink-0 rounded-[9px] ring-1 ring-white/20" />
          <div className="min-w-0">
            <div className="font-display text-xl leading-tight font-bold">{settings?.business_name || 'StitchLog'}</div>
            <div className="text-sm text-white/55">StitchLog</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.filter((n) => n.to !== '/settings').map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex h-11 items-center gap-3 rounded-lg px-3 font-semibold', isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white')
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
          <SettingsToggle />
        </nav>
        <button onClick={logout} className="mt-auto h-11 rounded-lg px-3 text-left text-white/60 hover:text-white">
          Log out
        </button>
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
        <Outlet />
      </main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx('flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive ? 'text-thread' : 'text-ink-faint')
            }
          >
            {n.icon}
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}