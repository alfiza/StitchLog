import { StrictMode, lazy, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/bricolage-grotesque/500.css'
import '@fontsource/bricolage-grotesque/700.css'
import './index.css'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Today from './pages/Today'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import CustomerForm from './pages/CustomerForm'
import Jobs from './pages/Jobs'
import JobForm from './pages/JobForm'
import JobDetail from './pages/JobDetail'
import Reports from './pages/Reports'
import Inventory from './pages/Inventory'
import InventoryForm from './pages/InventoryForm'
import Settings, {
  BusinessDetailsSettings,
  GarmentTypesSettings,
  PasswordSettings,
  PriceListSettings,
  ReadyMessageSettings,
} from './pages/Settings'
import NotFound from './pages/NotFound'

// The customer's job page is loaded separately so it stays small and fast on their phone.
const PublicJob = lazy(() => import('./pages/PublicJob'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/j/:token"
              element={
                <Suspense fallback={<Loading />}>
                  <PublicJob />
                </Suspense>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Today />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/new" element={<CustomerForm />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="jobs/new" element={<JobForm />} />
              <Route path="jobs/:id" element={<JobDetail />} />
              <Route path="jobs/:id/edit" element={<JobForm />} />
              <Route path="reports" element={<Reports />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="inventory/new" element={<InventoryForm />} />
              <Route path="inventory/:id/edit" element={<InventoryForm />} />
              <Route path="nails-brows" element={<Inventory key="beauty" section="beauty" />} />
              <Route path="nails-brows/new" element={<InventoryForm key="beauty-new" section="beauty" />} />
              <Route path="nails-brows/:id/edit" element={<InventoryForm key="beauty-edit" section="beauty" />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/business" element={<BusinessDetailsSettings />} />
              <Route path="settings/message" element={<ReadyMessageSettings />} />
              <Route path="settings/garments" element={<GarmentTypesSettings />} />
              <Route path="settings/prices" element={<PriceListSettings />} />
              <Route path="settings/password" element={<PasswordSettings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
