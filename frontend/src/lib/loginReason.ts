/** Why the login page was opened, from the address the shopper was trying to reach. Shown above the form. */
export function loginReason(from: string | null | undefined): { title: string; text: string } | null {
  if (!from || from === '/') return null
  const path = from.split('?')[0] ?? ''
  if (path === '/checkout') return { title: 'Log in to place your order', text: 'Your cart is saved. You will come straight back to checkout.' }
  if (path === '/orders' || path.startsWith('/order/')) return { title: 'Log in to see your orders', text: 'Orders are private to your account, so we need to know it is you.' }
  if (path === '/settings' || path === '/account') return { title: 'Log in to manage your account', text: 'Addresses, saved payments and your profile live in your account.' }
  if (path.startsWith('/help/tickets')) return { title: 'Log in to see your requests', text: 'Your support conversations are kept in your account.' }
  if (path === '/help/new') return { title: 'Log in to link an order', text: 'Linking an order and adding photos helps us sort it out faster.' }
  if (path.startsWith('/product/')) return { title: 'Log in to write a review', text: 'Reviews come from signed-in shoppers, so others can trust them.' }
  if (path === '/wishlist') return { title: 'Log in to keep your wishlist', text: 'Your saved items will follow you to every device.' }
  return { title: 'Please log in to continue', text: 'That page needs your account.' }
}
