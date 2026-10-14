import { useSearchParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { HelpNav } from '../components/support/HelpNav.tsx'
import { RequestForm } from '../components/support/RequestForm.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { topics, type TopicId } from '../lib/support.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

/** /help/new, optionally /help/new?topic=DELIVERY&order=ORD-1044 (links from the order page). */
export function NewRequestPage() {
  useDocumentTitle('Ask for help', { noindex: true })
  const [params] = useSearchParams()
  const topic = topics.find((item) => item.id === params.get('topic'))?.id as TopicId | undefined
  const order = params.get('order') ?? undefined
  return (
    <div className="bg-canvas">
      <PageHero title="Ask for help" intro="Tell us what went wrong. A real person on our team reads every request." />
      <HelpNav />
      <Container className="py-8 sm:py-12">
        <RequestForm key={`${topic ?? ''}-${order ?? ''}`} initialTopic={topic} initialOrder={order} />
      </Container>
    </div>
  )
}
