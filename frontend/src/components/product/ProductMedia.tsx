import type { ArtTone } from '../../types.ts'
import { ProductArt } from './ProductArt.tsx'

export function ProductMedia({
  name,
  image,
  art,
  className = '',
}: {
  name: string
  image: string | null
  art: ArtTone
  className?: string
}) {
  if (image) {
    return <img src={image} alt={name} className={`object-cover ${className}`} />
  }
  return <ProductArt name={name} art={art} className={className} />
}
