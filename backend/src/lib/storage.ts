import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { badRequest } from './errors.js'
import { env, isLocalStack } from './env.js'

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

/** Public Supabase Storage buckets. The API uploads with the service key; the shop reads the public URL. */
export const imageBuckets = {
  product: 'product-images',
  category: 'category-images',
  banner: 'banner-images',
  profile: 'profile-images',
  review: 'review-images',
} as const

export type ImagePurpose = keyof typeof imageBuckets

const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

const imageFilter: multer.Options['fileFilter'] = (_req, file, cb) => (extensions[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG or WebP images are allowed')))

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFilter,
})

/** Up to four customer photos on one review. */
export const reviewImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: imageFilter,
})

/** Saves one image and returns the URL to store on the record. */
export async function storeImage(file: Express.Multer.File, purpose: ImagePurpose) {
  const ext = extensions[file.mimetype]
  if (!ext) throw badRequest('Only JPG, PNG or WebP images are allowed')
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`
  const bucket = imageBuckets[purpose]
  if (isLocalStack) {
    const dir = path.join(UPLOAD_DIR, bucket)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, filename), file.buffer)
    return `/uploads/${bucket}/${filename}`
  }
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, apikey: env.SUPABASE_SERVICE_KEY, 'Content-Type': file.mimetype, 'x-upsert': 'false' },
    body: new Uint8Array(file.buffer),
  })
  if (!response.ok) throw new Error(`Image upload failed: ${response.status} ${await response.text()}`)
  return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`
}
