import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_PHOTOS, MAX_PHOTO_BYTES, photoTypes } from '../../lib/support.ts'
import { CloseIcon, PaperclipIcon } from '../icons.tsx'

/** Choose up to three photos. They are uploaded when the form is sent. */
export function PhotoPicker({ files, onChange, disabled = false, compact = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const add = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    let problem = ''
    for (const file of Array.from(list)) {
      if (!photoTypes.includes(file.type)) problem = 'Only JPG, PNG or WebP photos can be attached.'
      else if (file.size > MAX_PHOTO_BYTES) problem = 'Each photo must be under 5 MB.'
      else if (next.length >= MAX_PHOTOS) problem = `You can attach up to ${MAX_PHOTOS} photos.`
      else next.push(file)
    }
    setError(problem)
    onChange(next)
    if (input.current) input.current.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {previews.map((src, index) => (
          <span key={src} className="group relative size-16 overflow-hidden rounded-xl ring-1 ring-line">
            <img src={src} alt={`Attachment ${index + 1}`} className="size-full object-cover" />
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-ink/80 text-white opacity-90 hover:bg-ink"
            >
              <CloseIcon className="size-3" />
            </button>
          </span>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            className={`inline-flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-line text-sm font-bold text-ink-soft transition hover:border-brand hover:text-brand disabled:opacity-50 ${compact ? 'h-10 px-3' : 'h-16 px-4'}`}
          >
            <PaperclipIcon className="size-4" />
            {files.length ? 'Add another' : 'Add photos'}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={photoTypes.join(',')} multiple className="hidden" onChange={(event) => add(event.target.files)} />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
          {error}
        </p>
      ) : (
        !compact && <p className="mt-2 text-xs text-muted">Up to {MAX_PHOTOS} photos, JPG, PNG or WebP, 5 MB each. A clear photo of the pouch and its label helps us fix things faster.</p>
      )}
    </div>
  )
}
