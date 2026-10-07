import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { categories, products } from '../../frontend/src/data/products.ts'
import { coupons } from '../../frontend/src/data/promotions.ts'
import { reviews } from '../../frontend/src/data/reviews.ts'

const prisma = new PrismaClient()

async function main() {
  // Categories (top level first, then their subcategories)
  for (const [index, category] of categories.entries()) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, tagline: category.tagline, image: category.image, art: category.art, sortOrder: index },
      create: { id: category.id, name: category.name, tagline: category.tagline, image: category.image, art: category.art, sortOrder: index },
    })
    for (const [subIndex, sub] of category.subcategories.entries()) {
      await prisma.category.upsert({
        where: { id: sub.id },
        update: { name: sub.name, parentId: category.id, sortOrder: subIndex },
        create: { id: sub.id, name: sub.name, parentId: category.id, sortOrder: subIndex, art: category.art },
      })
    }
  }

  // Products with pack sizes as variants
  const idBySlug = new Map<string, string>()
  const idByLegacy = new Map<string, string>()
  for (const item of products) {
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
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
      },
    })
    idBySlug.set(item.slug, product.id)
    idByLegacy.set(item.id, product.id)
    for (const [index, pack] of item.packs.entries()) {
      const sku = `${item.slug}-${pack.size}`.toUpperCase()
      // Spread the product's stock over its packs so every size is buyable.
      const stock = item.inStock ? Math.max(3, Math.round(item.stock / item.packs.length)) : 0
      const existing = await prisma.productVariant.findUnique({ where: { sku } })
      if (existing) continue
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, size: pack.size, sku, price: pack.price, mrp: pack.mrp, stock, sortOrder: index },
      })
      if (stock > 0) {
        await prisma.stockMovement.create({ data: { variantId: variant.id, delta: stock, reason: 'RESTOCK', note: 'Opening stock', balance: stock } })
      }
    }
  }

  // Reviews (shown as approved)
  if ((await prisma.review.count()) === 0) {
    for (const review of reviews) {
      const productId = idByLegacy.get(review.productId)
      if (!productId) continue
      await prisma.review.create({
        data: { productId, name: review.name, city: review.city, rating: review.rating, comment: review.comment, status: 'APPROVED', verified: true },
      })
    }
  }

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: { code: coupon.code, label: coupon.label, type: coupon.type === 'percent' ? 'PERCENT' : 'FREE_SHIPPING', value: coupon.value },
    })
  }

  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.createMany({
      data: [
        { title: 'Find dry fruits that fuel your day', subtitle: 'Handpicked, sealed fresh to order', link: '/shop', placement: 'HERO', sortOrder: 0, image: '/images/almonds.jpg' },
        { title: '15% off every pouch', subtitle: 'Use code DRY15 at checkout', link: '/sale', placement: 'PROMO', sortOrder: 0, image: '/images/walnuts.jpg' },
      ],
    })
  }

  // Accounts
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@clickmart.com').toLowerCase()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD to create the admin account')
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Store Admin', email: adminEmail, role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 11) },
  })

  // Demo customers and orders so the dashboard has something to show.
  if ((await prisma.order.count()) === 0 && process.env.NODE_ENV !== 'production') {
    const demo = [
      { id: 1044, name: 'Neha Gupta', city: 'Pune', state: 'Maharashtra', status: 'SHIPPED', slug: 'pistachios', days: 5 },
      { id: 1045, name: 'Vikram Patel', city: 'Ahmedabad', state: 'Gujarat', status: 'DELIVERED', slug: 'premium-almonds', days: 4 },
      { id: 1046, name: 'Anjali Singh', city: 'Delhi', state: 'Delhi', status: 'SHIPPED', slug: 'mixed-dry-fruits', days: 4 },
      { id: 1047, name: 'Rahul Verma', city: 'Bengaluru', state: 'Karnataka', status: 'CONFIRMED', slug: 'cashews-w240', days: 3 },
      { id: 1048, name: 'Priya Sharma', city: 'Mumbai', state: 'Maharashtra', status: 'DELIVERED', slug: 'walnuts', days: 3 },
    ] as const
    for (const entry of demo) {
      const product = await prisma.product.findFirst({ where: { slug: { contains: entry.slug.split('-')[0]! } }, include: { variants: true } })
      const variant = product?.variants[1] ?? product?.variants[0]
      if (!product || !variant) continue
      const email = `${entry.name.split(' ')[0]!.toLowerCase()}@example.com`
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { name: entry.name, email, passwordHash: await bcrypt.hash('Customer@123', 10) },
      })
      const placed = new Date(Date.now() - entry.days * 86400000)
      const chain = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const
      const reached = chain.slice(0, chain.indexOf(entry.status as (typeof chain)[number]) + 1)
      await prisma.order.create({
        data: {
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
          total: variant.price + (variant.price >= 499 ? 0 : 49),
          shipping: variant.price >= 499 ? 0 : 49,
          status: entry.status,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          createdAt: placed,
          items: { create: [{ variantId: variant.id, productId: product.id, name: product.name, slug: product.slug, image: product.images[0] ?? null, art: product.art, size: variant.size, unitPrice: variant.price, mrp: variant.mrp, quantity: 1 }] },
          events: { create: reached.map((status, index) => ({ status, note: status.replaceAll('_', ' ').toLowerCase(), createdAt: new Date(placed.getTime() + index * 8 * 3600000) })) },
        },
      })
    }
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"', 'number'), GREATEST(1048, (SELECT COALESCE(MAX(number), 1048) FROM "Order")))`)
  }

  console.log(`Seeded ${categories.length} categories, ${products.length} products, admin ${adminEmail}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
