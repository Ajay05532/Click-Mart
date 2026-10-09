// Loads the starting catalogue, coupons, banners and the admin account into whatever
// Supabase project backend/.env points at. Safe to run more than once.
import { categories, products } from './seed-data/products.js'
import { coupons } from './seed-data/promotions.js'
import { reviews } from './seed-data/reviews.js'
import { ensureAccount } from '../src/lib/account.js'
import { from, count, exec, maybe, one, rows, rpc  } from '../src/lib/db.js'

const weightFromSize = (size: string) => {
  const match = size.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kg|g)$/)
  if (!match) return null
  const amount = Number(match[1])
  return match[2] === 'kg' ? Math.round(amount * 1000) : Math.round(amount)
}
import { env } from '../src/lib/env.js'
import { hashPassword } from '../src/lib/passwords.js'

async function main() {
  console.log(`Seeding ${env.SUPABASE_URL}`)

  // Categories (top level first, then their subcategories)
  for (const [index, category] of categories.entries()) {
    await exec(from('Category').upsert({ id: category.id, name: category.name, tagline: category.tagline, image: category.image, art: category.art, sortOrder: index }, { onConflict: 'id' }))
    for (const [subIndex, sub] of category.subcategories.entries()) {
      await exec(from('Category').upsert({ id: sub.id, name: sub.name, parentId: category.id, sortOrder: subIndex, art: category.art }, { onConflict: 'id' }))
    }
  }

  // Products with pack sizes as variants
  const idByLegacy = new Map<string, string>()
  for (const item of products) {
    let product = await maybe<{ id: string }>(from('Product').select('id').eq('slug', item.slug).maybeSingle())
    if (!product) {
      product = await one<{ id: string }>(
        from('Product')
          .insert({
            slug: item.slug,
            name: item.name,
            categoryId: item.category,
            subcategoryId: item.subcategory,
            blurb: item.blurb,
            description: item.description,
            highlights: item.highlights,
            nutrition: item.nutrition,
            images: item.image ? [item.image] : [],
            art: item.art,
            isBestseller: Boolean(item.bestseller),
            featuredSize: item.featuredSize,
            sold: item.sold,
            ratingAvg: item.rating,
            ratingCount: item.reviewCount,
            isActive: true,
          })
          .select('id')
          .single(),
      )
    }
    idByLegacy.set(item.id, product.id)
    if (item.image) await rpc('set_product_images', { p_product_id: product.id, p_urls: [item.image] })
    for (const [index, pack] of item.packs.entries()) {
      const sku = `${item.slug}-${pack.size}`.toUpperCase()
      const existingVariant = await maybe<{ id: string; weightGrams: number | null }>(from('ProductVariant').select('id, weightGrams').eq('sku', sku).maybeSingle())
      if (existingVariant) {
        const grams = weightFromSize(pack.size)
        if (grams && existingVariant.weightGrams == null) await exec(from('ProductVariant').update({ weightGrams: grams }).eq('id', existingVariant.id))
        continue
      }
      // Spread the product's stock over its packs so every size is buyable.
      const stock = item.inStock ? Math.max(3, Math.round(item.stock / item.packs.length)) : 0
      const variant = await one<{ id: string }>(
        from('ProductVariant').insert({ productId: product.id, size: pack.size, sku, barcode: null, weightGrams: weightFromSize(pack.size), price: pack.price, mrp: pack.mrp, stock, sortOrder: index }).select('id').single(),
      )
      if (stock > 0) await exec(from('StockMovement').insert({ variantId: variant.id, delta: stock, reason: 'RESTOCK', note: 'Opening stock', balance: stock }))
    }
  }

  // Reviews (shown as approved)
  if ((await count(from('Review').select('id', { count: 'exact', head: true }))) === 0) {
    const data = reviews
      .filter((review) => idByLegacy.has(review.productId))
      .map((review) => ({ productId: idByLegacy.get(review.productId)!, name: review.name, city: review.city, rating: review.rating, comment: review.comment, status: 'APPROVED', verified: true }))
    if (data.length) await exec(from('Review').insert(data))
  }

  for (const coupon of coupons) {
    await exec(
      from('Coupon').upsert({ code: coupon.code, label: coupon.label, type: coupon.type === 'percent' ? 'PERCENT' : 'FREE_SHIPPING', value: coupon.value }, { onConflict: 'code', ignoreDuplicates: true }),
    )
  }

  if ((await count(from('Banner').select('id', { count: 'exact', head: true }))) === 0) {
    await exec(
      from('Banner').insert([
        { title: 'Find dry fruits that fuel your day', subtitle: 'Handpicked, sealed fresh to order', link: '/shop', placement: 'HERO', sortOrder: 0, image: '/images/almonds.jpg' },
        { title: '15% off every pouch', subtitle: 'Use code DRY15 at checkout', link: '/sale', placement: 'PROMO', sortOrder: 0, image: '/images/walnuts.jpg' },
      ]),
    )
  }

  // Admin account (name, email and password come from SEED_ADMIN_* in .env). Only the hash is stored.
  const adminEmail = env.SEED_ADMIN_EMAIL.trim().toLowerCase()
  const adminPassword = env.SEED_ADMIN_PASSWORD
  if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD in .env to create the admin account')
  const admin = await ensureAccount({ email: adminEmail, name: env.SEED_ADMIN_NAME, role: 'ADMIN', passwordHash: await hashPassword(adminPassword) })
  console.log(admin.created ? `Created admin ${adminEmail}` : `Admin ${adminEmail} already exists (password left unchanged)`)
  if (adminPassword.length < 8) console.warn('WARNING: the seeded admin password is shorter than 8 characters. Change it from Account > Change password after the first login.')

  const brand = await maybe<{ id: string }>(from('Brand').select('id').eq('slug', 'clickmart').maybeSingle())
  const brandId = brand?.id ?? (await one<{ id: string }>(from('Brand').insert({ id: 'brand_clickmart', name: 'ClickMart', slug: 'clickmart' }).select('id').single())).id
  await exec(from('Product').update({ brandId, hsnCode: '0802', countryOfOrigin: 'India' }).is('brandId', null))

  const staffPassword = env.SEED_STAFF_PASSWORD
  if (staffPassword) {
    const staffEmail = env.SEED_STAFF_EMAIL.trim().toLowerCase()
    const staff = await ensureAccount({ email: staffEmail, name: env.SEED_STAFF_NAME, role: 'STAFF', passwordHash: await hashPassword(staffPassword) })
    console.log(staff.created ? `Created staff ${staffEmail}` : `Staff ${staffEmail} already exists (password left unchanged)`)
  }

  // Demo customers and orders so the dashboard has something to show (never in production).
  if (env.NODE_ENV !== 'production' && (await count(from('Order').select('id', { count: 'exact', head: true }))) === 0) {
    const demo = [
      { id: 1044, name: 'Neha Gupta', city: 'Pune', state: 'Maharashtra', status: 'SHIPPED', slug: 'pistachios', days: 5 },
      { id: 1045, name: 'Vikram Patel', city: 'Ahmedabad', state: 'Gujarat', status: 'DELIVERED', slug: 'almonds', days: 4 },
      { id: 1046, name: 'Anjali Singh', city: 'Delhi', state: 'Delhi', status: 'SHIPPED', slug: 'mixed', days: 4 },
      { id: 1047, name: 'Rahul Verma', city: 'Bengaluru', state: 'Karnataka', status: 'CONFIRMED', slug: 'cashews', days: 3 },
      { id: 1048, name: 'Priya Sharma', city: 'Mumbai', state: 'Maharashtra', status: 'DELIVERED', slug: 'walnuts', days: 3 },
    ] as const
    const chain = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const
    for (const entry of demo) {
      const matches = await rows<{ id: string; name: string; slug: string; images: string[]; art: string; variants: { id: string; size: string; price: number; mrp: number }[] }>(
        from('Product').select('id, name, slug, images, art, variants:ProductVariant(id, size, price, mrp, sortOrder)').ilike('slug', `%${entry.slug}%`).limit(1),
      )
      const product = matches[0]
      const variant = product?.variants?.[1] ?? product?.variants?.[0]
      if (!product || !variant) continue
      const email = `${entry.name.split(' ')[0]!.toLowerCase()}@example.com`
      const user = await ensureAccount({ email, name: entry.name, role: 'CUSTOMER', passwordHash: await hashPassword('Customer@123') })
      const placed = new Date(Date.now() - entry.days * 86400000)
      const shipping = variant.price >= 499 ? 0 : 49
      const order = await one<{ id: string }>(
        from('Order')
          .insert({
            number: entry.id,
            userId: user.id,
            customerName: entry.name,
            email,
            phone: '9876543210',
            addressLine: '12 MG Road, Indiranagar',
            city: entry.city,
            state: entry.state,
            pin: '560038',
            subtotal: variant.price,
            total: variant.price + shipping,
            shipping,
            status: entry.status,
            paymentStatus: 'PAID',
            paymentMethod: 'UPI',
            createdAt: placed.toISOString(),
          })
          .select('id')
          .single(),
      )
      await exec(from('OrderItem').insert({ orderId: order.id, variantId: variant.id, productId: product.id, name: product.name, slug: product.slug, image: product.images[0] ?? null, art: product.art, size: variant.size, unitPrice: variant.price, mrp: variant.mrp, quantity: 1 }))
      const reached = chain.slice(0, chain.indexOf(entry.status as (typeof chain)[number]) + 1)
      await exec(from('OrderEvent').insert(reached.map((status, index) => ({ orderId: order.id, status, note: status.replaceAll('_', ' ').toLowerCase(), createdAt: new Date(placed.getTime() + index * 8 * 3600000).toISOString() }))))
    }
    await rpc('bump_order_number', { p_min: 1048 })
  }

  console.log(`Done: ${categories.length} categories, ${products.length} products, admin ${adminEmail}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
