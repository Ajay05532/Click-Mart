import { Router } from 'express'
import { z } from 'zod'
import { findAccountById, updateProfile } from '../services/account.js'
import { from, count, db, exec, maybe, one, rows, rpc } from '../database/db.js'
import { badRequest, notFound } from '../utils/errors.js'
import { imageUpload, storeImage } from '../services/storage.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { publicUser } from './auth.js'
import { locationRouter } from './location.js'
import { walletRouter } from './wallet.js'
export const meRouter = Router()
meRouter.use(requireAuth)
meRouter.get('/', async (req, res) => {
  const user = await findAccountById(actor(req).id)
  if (!user) throw notFound('Account')
  res.json({
    user: publicUser(user),
  })
})
meRouter.patch('/', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: z
        .string()
        .regex(/^[6-9]\d{9}$/)
        .nullable()
        .optional(),
      avatarUrl: z.null().optional(),
    })
    .parse(req.body)
  const user = Object.keys(data).length ? await updateProfile(actor(req).id, data) : await findAccountById(actor(req).id)
  if (!user) throw notFound('Account')
  res.json({
    user: publicUser(user),
  })
})
meRouter.post('/avatar', imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "image" field')
  const user = await updateProfile(actor(req).id, {
    avatarUrl: await storeImage(req.file, 'profile'),
  })
  res.status(201).json({
    user: publicUser(user),
  })
})
const addressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line: z.string().trim().min(8).max(250),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(60),
  pin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  landmark: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((value) => value || null),
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  isDefault: z.boolean().default(false),
})
meRouter.get('/addresses', async (req, res) => {
  res.json({
    items: await rows(
      from('Address')
        .select('*')
        .eq('userId', actor(req).id)
        .order('isDefault', {
          ascending: false,
        })
        .order('id'),
    ),
  })
})
meRouter.post('/addresses', async (req, res) => {
  const data = addressSchema.parse(req.body)
  const userId = actor(req).id
  const first =
    (await count(
      from('Address')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('userId', userId),
    )) === 0
  const { isDefault, ...fields } = data
  const address = await one(
    from('Address')
      .insert({
        ...fields,
        isDefault: false,
        userId,
      })
      .select()
      .single(),
  )
  if (isDefault || first)
    await rpc('set_default_address', {
      p_user: userId,
      p_id: address.id,
    })
  res.status(201).json(await one(from('Address').select('*').eq('id', address.id).single()))
})
meRouter.put('/addresses/:id', async (req, res) => {
  const data = addressSchema.parse(req.body)
  const userId = actor(req).id
  const existing = await maybe(from('Address').select('id').eq('id', String(req.params.id)).eq('userId', userId).maybeSingle())
  if (!existing) throw notFound('Address')
  const { isDefault, ...fields } = data
  await exec(from('Address').update(fields).eq('id', existing.id))
  if (isDefault)
    await rpc('set_default_address', {
      p_user: userId,
      p_id: existing.id,
    })
  res.json(await one(from('Address').select('*').eq('id', existing.id).single()))
})
meRouter.post('/addresses/:id/default', async (req, res) => {
  await rpc('set_default_address', {
    p_user: actor(req).id,
    p_id: String(req.params.id),
  })
  res.status(204).end()
})
meRouter.delete('/addresses/:id', async (req, res) => {
  const userId = actor(req).id
  const deleted = await rows(from('Address').delete().eq('id', String(req.params.id)).eq('userId', userId).select('isDefault'))
  if (deleted.length === 0) throw notFound('Address')
  if (deleted[0].isDefault) {
    const next = await maybe(from('Address').select('id').eq('userId', userId).order('id').limit(1).maybeSingle())
    if (next)
      await rpc('set_default_address', {
        p_user: userId,
        p_id: next.id,
      })
  }
  res.status(204).end()
})
meRouter.use('/location', locationRouter)
meRouter.use(walletRouter)
meRouter.get('/wishlist', async (req, res) => {
  const items = await rows(
    from('WishlistItem').select('productId').eq('userId', actor(req).id).order('createdAt', {
      ascending: false,
    }),
  )
  res.json({
    productIds: items.map((row) => row.productId),
  })
})
meRouter.put('/wishlist/:productId', async (req, res) => {
  const product = await maybe(from('Product').select('id').eq('id', String(req.params.productId)).maybeSingle())
  if (!product) throw notFound('Product')
  await exec(
    from('WishlistItem').upsert(
      {
        userId: actor(req).id,
        productId: String(req.params.productId),
      },
      {
        onConflict: 'userId,productId',
        ignoreDuplicates: true,
      },
    ),
  )
  res.status(204).end()
})
meRouter.delete('/wishlist/:productId', async (req, res) => {
  await exec(from('WishlistItem').delete().eq('userId', actor(req).id).eq('productId', String(req.params.productId)))
  res.status(204).end()
})
const cartSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(50),
})
async function loadCart(userId) {
  const items = await rows(from('CartItem').select('variantId, quantity').eq('userId', userId))
  if (items.length === 0) return []
  const variants = await rows(
    from('ProductVariant')
      .select('id, productId, size, stock, product:Product(name)')
      .in(
        'id',
        items.map((item) => item.variantId),
      ),
  )
  const byId = new Map(variants.map((variant) => [variant.id, variant]))
  return items.flatMap((row) => {
    const variant = byId.get(row.variantId)
    return variant
      ? [
          {
            variantId: row.variantId,
            quantity: Math.min(row.quantity, variant.stock),
            productId: variant.productId,
            name: variant.product.name,
            size: variant.size,
          },
        ]
      : []
  })
}
meRouter.get('/cart', async (req, res) =>
  res.json({
    items: await loadCart(actor(req).id),
  }),
)
meRouter.put('/cart', async (req, res) => {
  const { items } = cartSchema.parse(req.body)
  const userId = actor(req).id
  const known = items.length
    ? await rows(
        from('ProductVariant')
          .select('id')
          .in(
            'id',
            items.map((item) => item.variantId),
          )
          .eq('isActive', true),
      )
    : []
  const valid = new Set(known.map((variant) => variant.id))
  const unique = new Map()
  for (const item of items) if (valid.has(item.variantId)) unique.set(item.variantId, Math.min(99, (unique.get(item.variantId) ?? 0) + item.quantity))
  await exec(from('CartItem').delete().eq('userId', userId))
  if (unique.size)
    await exec(
      from('CartItem').insert(
        [...unique].map(([variantId, quantity]) => ({
          userId,
          variantId,
          quantity,
        })),
      ),
    )
  res.json({
    items: await loadCart(userId),
  })
})
