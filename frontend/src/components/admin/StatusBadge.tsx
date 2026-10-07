import type { OrderStatus } from '../../types.ts'

const styles: Record<OrderStatus, string> = {
  Delivered: 'bg-emerald-50 text-emerald-700',
  Processing: 'bg-amber-50 text-amber-700',
  Shipped: 'bg-sky-50 text-sky-700',
  Cancelled: 'bg-rose-50 text-rose-700',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>
}
