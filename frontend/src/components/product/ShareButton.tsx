import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CopyIcon, MailIcon, ShareIcon } from '../icons.tsx'

type Props = {
  /** Page title, used as the share sheet title and email subject. */
  title: string
  /** One line that goes before the link (WhatsApp, X, Telegram, email). */
  text: string
  url: string
  /** `round` sits in a row of buttons; `overlay` is the small white circle on a product photo. */
  variant?: 'round' | 'overlay'
  /** Accessible name, e.g. "Share Almonds". */
  label?: string
  className?: string
}

function Brand({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  )
}

const WHATSAPP =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z'
const FACEBOOK =
  'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'
const X_LOGO = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
const TELEGRAM =
  'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'

/** Phones and tablets get their own share sheet; desktops get our menu, which is easier to aim at. */
const prefersNativeSheet = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches

export function ShareButton({ title, text, url, variant = 'round', label = 'Share this product', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // The menu is drawn on <body> so a card's rounded, clipped corners cannot cut it off.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const measure = () => {
      const box = trigger.current!.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 16)
      const height = menu.current?.offsetHeight ?? 220
      const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8)
      const below = box.bottom + 8
      const top = below + height > window.innerHeight - 8 && box.top - 8 - height > 8 ? box.top - 8 - height : below
      setPlace({ top, left, width })
    }
    measure()
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url })
      setOpen(false)
    } catch (error) {
      // Closing the share sheet counts as an error; only fall back to the menu for real failures.
      if ((error as DOMException)?.name !== 'AbortError') setOpen(true)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const field = document.createElement('textarea')
      field.value = url
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const line = `${text} ${url}`
  const targets: { label: string; href: string; icon: ReactNode; tone: string }[] = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(line)}`, icon: <Brand path={WHATSAPP} className="size-5" />, tone: 'bg-[#25D366] text-white' },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, icon: <Brand path={FACEBOOK} className="size-5" />, tone: 'bg-[#1877F2] text-white' },
    { label: 'X', href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, icon: <Brand path={X_LOGO} className="size-4" />, tone: 'bg-black text-white' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, icon: <Brand path={TELEGRAM} className="size-5" />, tone: 'bg-[#26A5E4] text-white' },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(line)}`, icon: <MailIcon className="size-5" />, tone: 'bg-canvas text-ink ring-1 ring-line' },
  ]

  const look =
    variant === 'overlay'
      ? `size-9 bg-white/95 shadow-md backdrop-blur hover:scale-110 ${open ? 'text-brand' : 'text-ink hover:text-brand'}`
      : `size-[52px] border-2 ${open ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink hover:border-brand/40 hover:text-brand'}`

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (prefersNativeSheet()) void nativeShare()
          else setOpen((value) => !value)
        }}
        className={`grid shrink-0 place-items-center rounded-full transition duration-200 ${look} ${className}`}
      >
        <ShareIcon className={variant === 'overlay' ? 'size-[17px]' : 'size-5'} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="dialog"
            aria-label={label}
            style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, width: place?.width ?? 320 }}
            className="motion-panel fixed z-[60] rounded-2xl border border-line bg-white p-4 text-left text-ink shadow-pop"
          >
            <p className="text-sm font-extrabold">Share this product</p>
            <ul className="mt-3 grid grid-cols-5 gap-1">
              {targets.map((target) => (
                <li key={target.label}>
                  <a
                    href={target.href}
                    target={target.label === 'Email' ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="group flex flex-col items-center gap-1.5 rounded-xl py-1.5 text-[11px] font-semibold text-ink-soft"
                  >
                    <span className={`grid size-10 place-items-center rounded-full transition group-hover:scale-105 ${target.tone}`}>{target.icon}</span>
                    {target.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-canvas p-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate text-xs text-muted" title={url}>
                {url.replace(/^https?:\/\//, '')}
              </span>
              <button type="button" onClick={() => void copy()} className={`btn btn-sm shrink-0 ${copied ? 'bg-success text-white' : 'btn-brand'}`} aria-live="polite">
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {typeof navigator.share === 'function' && (
              <button type="button" onClick={() => void nativeShare()} className="mt-2 w-full rounded-lg py-1.5 text-xs font-bold text-brand hover:bg-brand-soft">
                More options…
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
