import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

/** Six single-digit boxes for an emailed code. Typing moves forward, Backspace moves back, paste fills all six. */
export function CodeInput({ value, onChange, disabled = false, invalid = false }: { value: string; onChange: (value: string) => void; disabled?: boolean; invalid?: boolean }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '')
  const focus = (index: number) => boxes.current[Math.max(0, Math.min(5, index))]?.focus()

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').replace(/\s/g, '').slice(0, 6))
  }

  const onKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault()
      setDigit(index - 1, '')
      focus(index - 1)
    }
    if (event.key === 'ArrowLeft') focus(index - 1)
    if (event.key === 'ArrowRight') focus(index + 1)
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    event.preventDefault()
    onChange(pasted)
    focus(pasted.length)
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid}
          autoFocus={index === 0}
          onPaste={onPaste}
          onKeyDown={onKey(index)}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, '')
            if (typed.length > 1) {
              onChange((digits.slice(0, index).join('') + typed).slice(0, 6))
              focus(index + typed.length)
              return
            }
            setDigit(index, typed)
            if (typed) focus(index + 1)
          }}
          className={`h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center text-2xl font-extrabold text-ink tabular-nums outline-none transition focus:border-brand focus:shadow-[0_0_0_4px_rgb(18_58_134/0.12)] disabled:opacity-60 ${invalid ? 'border-rose-400' : digit ? 'border-brand/50' : 'border-line'}`}
        />
      ))}
    </div>
  )
}
