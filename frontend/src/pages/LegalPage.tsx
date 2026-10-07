import { Container } from '../components/layout/Container.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function PrivacyPage() {
  useDocumentTitle('Privacy Policy')
  return (
    <div className="bg-canvas">
      <PageHero title="Privacy Policy" intro="What we keep when you browse, sign in or place an order." />
      <Container className="max-w-3xl py-10">
        <div className="space-y-4 rounded-2xl bg-white p-6 text-sm leading-7 text-muted shadow-sm">
          <p>ClickMart stores your name and email in this browser when you log in, and your cart until you clear it. Passwords and card numbers are not saved.</p>
          <p>Order details stay on this device so the seller dashboard can show a recent order. We do not sell customer lists.</p>
          <p>You can clear site data from your browser settings to remove the cart, account and orders stored locally.</p>
        </div>
      </Container>
    </div>
  )
}

export function TermsPage() {
  useDocumentTitle('Terms & Conditions')
  return (
    <div className="bg-canvas">
      <PageHero title="Terms & Conditions" intro="The short version of how orders, shipping and returns work." />
      <Container className="max-w-3xl py-10">
        <div className="space-y-4 rounded-2xl bg-white p-6 text-sm leading-7 text-muted shadow-sm">
          <p>Prices are in Indian rupees and include the pack size shown on the product. A coupon applies once per order.</p>
          <p>Shipping is free above ₹499, unless a free-shipping coupon is applied. Delivery estimates are shared after the order is packed.</p>
          <p>Unopened pouches can be returned within 7 days if the seal is intact. Perishable snacks that have been opened are not returnable.</p>
        </div>
      </Container>
    </div>
  )
}
