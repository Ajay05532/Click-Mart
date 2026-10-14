import { Container } from '../components/layout/Container.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useSeo } from '../lib/seo.ts'

const recipes = [
  {
    title: 'Almond & date bites',
    time: '15 min',
    steps: 'Pulse almonds, dates and a pinch of salt. Roll into balls. Keep them in the fridge.',
  },
  {
    title: 'Warm walnut oats',
    time: '10 min',
    steps: 'Cook oats in milk, then finish with chopped walnuts, raisins and a little honey.',
  },
  {
    title: 'Ghee roasted makhana',
    time: '8 min',
    steps: 'Heat a spoon of ghee, toss makhana until crisp, and season with salt and pepper.',
  },
  {
    title: 'Pistachio curd bowl',
    time: '5 min',
    steps: 'Thick curd, chopped pistachios, a few raisins and a grate of orange zest.',
  },
]

export function RecipesPage() {
  useSeo({ title: 'Dry fruit recipes', description: 'Quick, simple recipes with almonds, cashews, pistachios, raisins and seeds. Ideas for breakfast, snacks and desserts from the ClickMart kitchen.' })
  return (
    <div className="bg-canvas">
      <PageHero title="Recipes" intro="Short recipes that use the pouches already in the pantry." />
      <Container className="grid gap-4 py-10 md:grid-cols-2">
        {recipes.map((recipe) => (
          <article key={recipe.title} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-accent">{recipe.time}</p>
            <h2 className="mt-1 text-lg font-semibold">{recipe.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{recipe.steps}</p>
          </article>
        ))}
      </Container>
    </div>
  )
}
