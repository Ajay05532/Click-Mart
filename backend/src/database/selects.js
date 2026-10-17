export const ORDER_SELECT = '*, items:OrderItem(*), events:OrderEvent(*)'
export const PRODUCT_SELECT = '*, variants:ProductVariant(*), category:Category!categoryId(*), subcategory:Category!subcategoryId(*), brand:Brand(name)'
