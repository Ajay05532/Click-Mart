import type { ReactNode } from 'react'
import { Container } from '../layout/Container.tsx'

export function PageHero({ title, intro, children }: { title: string; intro: string; children?: ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white">
      <Container className="py-12">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-white/80">{intro}</p>
        {children}
      </Container>
    </div>
  )
}
