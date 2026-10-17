import { featuredPack } from './catalog.ts'
import type { Product } from '../types.ts'

/** Live products whose name contains any of the words, in-stock first. Used to link content pages to real pouches. */
export function productsMatching(products: Product[], words: string[]) {
  const wanted = words.map((word) => word.toLowerCase())
  return products
    .filter((product) => wanted.some((word) => product.name.toLowerCase().includes(word)))
    .sort((a, b) => Number(b.inStock) - Number(a.inStock))
}

export const fromPrice = (product: Product) => featuredPack(product).price
