export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  const btn =
    'grid size-9 place-items-center rounded-full text-lg leading-none text-ink transition hover:bg-white hover:text-brand hover:shadow-sm active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-canvas p-1 ring-1 ring-line">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease quantity">
        −
      </button>
      <span className="min-w-9 text-center text-sm font-extrabold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase quantity">
        +
      </button>
    </div>
  )
}
