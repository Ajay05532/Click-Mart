import { Router } from 'express'
import { z } from 'zod'
import { badRequest } from '../../lib/errors.js'
import { imageUpload, storeImage, UPLOAD_DIR } from '../../lib/storage.js'
import { staffOnly } from '../../middleware/auth.js'
import { adminCatalogRouter } from './catalog.js'
import { adminMarketingRouter } from './marketing.js'
import { adminOpsRouter } from './operations.js'

export { UPLOAD_DIR }

export const adminRouter = Router()
adminRouter.use(staffOnly)

/**
 * Photos go to the Supabase Storage bucket (public URL stored on the product).
 * The local development stack has no Storage service, so it falls back to the uploads/ folder.
 */
adminRouter.post('/uploads', imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "image" field')
  const purpose = z.enum(['product', 'category', 'banner']).parse(req.body.purpose ?? 'product')
  res.status(201).json({ url: await storeImage(req.file, purpose) })
})

adminRouter.use(adminCatalogRouter)
adminRouter.use(adminMarketingRouter)
adminRouter.use(adminOpsRouter)
