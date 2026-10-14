import { Router } from 'express'
import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'
import { imageUpload, storeImage } from '../../services/storage.js'
import { permissionGate, staffOnly } from '../../middleware/auth.js'
import { adminCatalogRouter } from './catalog.js'
import { adminMarketingRouter } from './marketing.js'
import { adminOpsRouter } from './operations.js'
import { adminImportsRouter } from './imports.js'
import { adminPrintRouter } from './print.js'
import { adminReportsRouter } from './reports.js'
import { adminSupportRouter } from './support.js'
export const adminRouter = Router()
adminRouter.use(staffOnly)
adminRouter.use(permissionGate)
adminRouter.post('/uploads', imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "image" field')
  const purpose = z.enum(['product', 'category', 'banner']).parse(req.body.purpose ?? 'product')
  res.status(201).json({
    url: await storeImage(req.file, purpose),
  })
})
adminRouter.use(adminCatalogRouter)
adminRouter.use(adminMarketingRouter)
adminRouter.use(adminOpsRouter)
adminRouter.use(adminSupportRouter)
adminRouter.use(adminReportsRouter)
adminRouter.use(adminImportsRouter)
adminRouter.use(adminPrintRouter)
