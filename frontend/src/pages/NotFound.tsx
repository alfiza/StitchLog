import { ButtonLink, PageTitle } from '../components/ui'

export default function NotFound() {
  return (
    <div>
      <PageTitle>Page not found</PageTitle>
      <p className="mb-6 text-ink-soft">This page doesn't exist. It may have been a deleted job or customer.</p>
      <ButtonLink to="/">Go to Today</ButtonLink>
    </div>
  )
}
