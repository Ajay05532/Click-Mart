import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useSeo } from '../lib/seo.ts'

const notes = [
  {
    title: 'Almonds for the long afternoon',
    text: 'A small handful brings protein, fibre and vitamin E. Pair them with fruit instead of a sweet biscuit.',
    to: '/product/premium-almonds',
  },
  {
    title: 'Walnuts and everyday fats',
    text: 'Walnut kernels are one of the easier ways to add plant omega-3 to breakfast or a salad.',
    to: '/product/walnuts',
  },
  {
    title: 'Seeds when you want something lighter',
    text: 'Pumpkin seeds and chia sit well in curd, oats and lemon water. Start with a spoon, not a bowl.',
    to: '/shop?category=seeds',
  },
]

export function WellnessPage() {
  useSeo({ title: 'Health & Wellness', description: 'How to enjoy almonds, walnuts, dates and seeds through the week. Practical, no-hype ideas for everyday eating.' })
  return (
    <div className="bg-canvas">
      <PageHero
        title="Health & Wellness"
        intro="Dry fruits are food, not a cure. Here is how we like to eat them through the week."
      />
      <Container className="grid gap-4 py-10 md:grid-cols-3">
        {notes.map((note) => (
          <article key={note.title} className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{note.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{note.text}</p>
            <Link to={note.to} className="mt-4 inline-block text-sm font-semibold text-brand">
              Shop this
            </Link>
          </article>
        ))}
      </Container>
    </div>
  )
}
