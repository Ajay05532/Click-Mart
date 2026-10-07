import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { badRequest } from '../../lib/errors.js'
import { staffOnly } from '../../middleware/auth.js'
import { adminCatalogRouter } from './catalog.js'
import { adminMarketingRouter } from './marketing.js'
import { adminOpsRouter } from './operations.js'

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

const types: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${types[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (types[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG or WebP images are allowed'))),
})

export const adminRouter = Router()
adminRouter.use(staffOnly)

// Local-disk storage for development. Swap this handler for a Cloudinary/S3 signed upload in production.
adminRouter.post('/uploads', upload.single('image'), (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "image" field')
  res.status(201).json({ url: `/uploads/${req.file.filename}` })
})

adminRouter.use(adminCatalogRouter)
adminRouter.use(adminMarketingRouter)
adminRouter.use(adminOpsRouter)
