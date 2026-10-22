import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** A small "are you sure?" box. Escape or a click outside cancels; the safe choice has focus. */
export function ConfirmDialog({
  title,
  text,
  icon,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  text?: ReactNode
  icon?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="motion-pop w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-pop">
        {icon && <div className={`mx-auto grid size-14 place-items-center rounded-2xl ${danger ? 'bg-rose-50 text-rose-600' : 'bg-brand-soft text-brand'}`}>{icon}</div>}
        <h2 id="confirm-title" className="mt-4 text-lg leading-snug font-extrabold text-ink">
          {title}
        </h2>
        {text && <div className="mt-1.5 text-sm leading-6 text-muted">{text}</div>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-outline">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={`btn ${danger ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-accent'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
