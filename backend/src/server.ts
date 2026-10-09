import { createApp } from './app.js'
import { env } from './lib/env.js'
import { expireStaleOrders } from './lib/orders.js'
import { purgeExpiredRefreshTokens } from './lib/auth.js'

const app = createApp()
const server = app.listen(env.PORT, () => {
  console.log(`ClickMart API listening on http://localhost:${env.PORT} (${env.NODE_ENV}, payments: ${env.PAYMENT_PROVIDER})`)
})

// Release stock held by online orders that were never paid.
const sweep = setInterval(() => {
  expireStaleOrders().catch((error) => console.error('expire sweep failed', error))
  purgeExpiredRefreshTokens().catch((error) => console.error('token purge failed', error))
}, 5 * 60 * 1000)

async function shutdown() {
  clearInterval(sweep)
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
