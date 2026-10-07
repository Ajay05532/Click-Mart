import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <Container className="py-20 text-center">
      <p className="text-8xl font-extrabold text-brand/15">404</p>
      <h1 className="mt-2 text-3xl font-extrabold">Page not found</h1>
      <p className="mt-2 text-muted">That link does not match a page in the shop.</p>
      <Link to="/" className="btn btn-brand btn-lg mt-8">
        Go home
      </Link>
    </Container>
  )
}
