import type { ReactNode } from 'react'
import { Container } from '../layout/Container.tsx'

/**
 * Page header shared by content pages (about, recipes, wellness, contact, policies, help).
 * `aside` puts a picture or panel on the right on large screens.
 */
export function PageHero({ title, intro, eyebrow, aside, children }: { title: string; intro: string; eyebrow?: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-line bg-gradient-to-b from-cream to-white">
      <Container className={`relative py-9 sm:py-12 ${aside ? 'grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-12' : ''}`}>
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-ink sm:text-[2.6rem]">{title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-soft">{intro}</p>
          {children}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </Container>
    </div>
  )
}
