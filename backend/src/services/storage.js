import { randomBytes } from 'node:crypto'
import multer from 'multer'
import { badRequest } from '../utils/errors.js'
import { env } from '../config/env.js'
export const imageBuckets = {
  product: 'product-images',
  category: 'category-images',
  banner: 'banner-images',
  profile: 'profile-images',
  review: 'review-images',
  support: 'support-attachments',
}
const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const imageFilter = (_req, file, cb) => (extensions[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG or WebP images are allowed')))
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: imageFilter,
})
export const reviewImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
  },
  fileFilter: imageFilter,
})
/** Up to three photos on one support message. */
export const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
  },
  fileFilter: imageFilter,
})
export async function storeImage(file, purpose) {
  const ext = extensions[file.mimetype]
  if (!ext) throw badRequest('Only JPG, PNG or WebP images are allowed')
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`
  const bucket = imageBuckets[purpose]
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      apikey: env.SUPABASE_SERVICE_KEY,
      'Content-Type': file.mimetype,
      'x-upsert': 'false',
    },
    body: new Uint8Array(file.buffer),
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status} ${await response.text()}`)
  return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`
}
