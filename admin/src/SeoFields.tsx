import { Field, Input, Textarea } from './ui.tsx'

const STORE = ((import.meta.env.VITE_STOREFRONT_URL as string | undefined) || (import.meta.env.DEV ? 'http://localhost:5173' : '')).replace(/\/$/, '')
const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`)

function Count({ value, max }: { value: number; max: number }) {
  return <span className={`tabular-nums ${value > max ? 'text-rose-600' : value > max - 10 ? 'text-orange-600' : 'text-muted'}`}>{value}/{max}</span>
}

/**
 * Title and description Google shows for a page, with a preview of the result. Empty fields
 * fall back to the automatic text, which the preview shows in grey.
 */
export function SeoFields({
  title,
  description,
  onTitle,
  onDescription,
  auto,
  path,
}: {
  title: string
  description: string
  onTitle: (value: string) => void
  onDescription: (value: string) => void
  auto: { title: string; description: string }
  path: string
}) {
  const shownTitle = `${title.trim() || auto.title} · ClickMart`
  const shownDescription = description.trim() || auto.description
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Google preview</p>
        <p className="mt-2 truncate text-xs text-emerald-700">{STORE}{path}</p>
        <p className={`mt-0.5 truncate text-lg leading-snug ${title.trim() ? 'text-[#1a0dab]' : 'text-[#1a0dab]/70'}`}>{clip(shownTitle, 70)}</p>
        <p className={`mt-1 line-clamp-2 text-sm leading-5 ${description.trim() ? 'text-ink-soft' : 'text-muted'}`}>{clip(shownDescription, DESCRIPTION_MAX)}</p>
      </div>
      <Field label="Search title" hint={title.trim() ? undefined : 'Empty uses the automatic title shown above'}>
        <span className="relative block">
          <Input value={title} maxLength={70} onChange={(event) => onTitle(event.target.value)} placeholder={auto.title} className="pr-16" />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-semibold">
            <Count value={title.trim().length} max={TITLE_MAX} />
          </span>
        </span>
      </Field>
      <Field label="Search description" hint={description.trim() ? 'Aim for 120 to 160 characters' : 'Empty uses the automatic description shown above'}>
        <Textarea rows={3} value={description} maxLength={170} onChange={(event) => onDescription(event.target.value)} placeholder={auto.description} />
        <span className="mt-1 block text-right text-[11px] font-semibold">
          <Count value={description.trim().length} max={DESCRIPTION_MAX} />
        </span>
      </Field>
    </div>
  )
}
