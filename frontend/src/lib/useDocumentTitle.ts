import { useSeo, type Seo } from './seo.ts'

/** Title only (plus any other SEO field). Private pages pass { noindex: true }. */
export function useDocumentTitle(title: string, options: Omit<Seo, 'title'> = {}) {
  useSeo({ title, ...options })
}
