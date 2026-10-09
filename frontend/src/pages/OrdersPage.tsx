import { ReceiptIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { OrderList } from '../components/order/OrderList.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { useMyOrders } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function OrdersPage() {
  useDocumentTitle('My Orders')
  const orders = useMyOrders()

  return (
    <div className="bg-canvas">
      <Container className="py-8 sm:py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">My orders</h1>
        <p className="mt-1 text-sm text-muted">Everything you have ordered, with live tracking.</p>

        {!orders.isLoading && !orders.isError && (orders.data?.length ?? 0) === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<ReceiptIcon className="size-9" />}
              title="No orders yet"
              text="When you place an order it will show up here so you can track it."
              action={{ to: '/shop', label: 'Start shopping' }}
            />
          </div>
        ) : (
          <div className="mt-8">
            <OrderList />
          </div>
        )}
      </Container>
    </div>
  )
}
