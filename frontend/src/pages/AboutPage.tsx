import { Container } from '../components/layout/Container.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useSeo } from '../lib/seo.ts'
import { organizationJsonLd } from '../lib/jsonld.ts'

const values = [
  { title: 'Handpicked', text: 'Every lot is checked for size, colour and freshness before it is packed.' },
  { title: 'Honest labels', text: 'Pack weights, grades and ingredients are written the way a kitchen would want them.' },
  { title: 'Packed to stay fresh', text: 'Resealable pouches and short storage so nuts reach you crunchy.' },
]

export function AboutPage() {
  useSeo({ title: 'About Us', description: 'ClickMart began as a small packing desk in Patna. We pack premium almonds, cashews, raisins, walnuts and seeds fresh after you order, and deliver across India.', jsonLd: organizationJsonLd() })
  return (
    <div className="bg-canvas">
      <PageHero
        title="About ClickMart"
        intro="We pack premium dry fruits for homes that want a better everyday snack — without the mystery mix."
      />
      <Container className="grid gap-6 py-10 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">From the packing table to your pantry</h2>
          <p className="mt-3 leading-7 text-muted">
            ClickMart started as a small packing desk in Patna. Almonds, cashews, raisins and walnuts were the first four pouches. The catalogue is larger now, but the rule is the same: if we would not keep it at home, it does not go in the box.
          </p>
          <p className="mt-3 leading-7 text-muted">
            Orders are packed after they are placed, not pulled from a warm warehouse shelf. That is why a pouch of walnuts still smells like walnuts.
          </p>
        </article>
        <img src="/images/almonds.jpg" alt="Premium almonds" className="h-64 w-full rounded-2xl object-cover shadow-sm lg:h-full" />
      </Container>
      <Container className="grid gap-4 pb-14 md:grid-cols-3">
        {values.map((value) => (
          <article key={value.title} className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-brand">{value.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{value.text}</p>
          </article>
        ))}
      </Container>
    </div>
  )
}
