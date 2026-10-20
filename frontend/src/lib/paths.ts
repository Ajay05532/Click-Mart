/** Address of a category (or sub-category) page. Keep in step with categoryPath in api/_shared.js. */
export const categoryPath = (category: string, sub?: string | null) => `/category/${encodeURIComponent(category)}${sub ? `/${encodeURIComponent(sub)}` : ''}`
