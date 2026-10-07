import { StarIcon } from '../icons.tsx'

export function Stars({ value, className = 'size-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.min(1, Math.max(0, value - index))
        return (
          <span key={index} className={`relative inline-block text-star ${className}`}>
            <StarIcon className="size-full" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className="size-full" filled />
            </span>
          </span>
        )
      })}
    </span>
  )
}
