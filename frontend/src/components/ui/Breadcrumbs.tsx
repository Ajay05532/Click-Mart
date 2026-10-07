import { Link } from 'react-router-dom'

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="text-sm font-medium text-muted" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 && <span className="px-2 opacity-50">›</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-brand">
              {item.label}
            </Link>
          ) : (
            <span className="font-bold text-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
