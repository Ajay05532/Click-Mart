import { prisma } from './prisma.js'

export const settingDefaults = {
  storeName: 'ClickMart',
  supportEmail: 'hello@clickmart.com',
  supportPhone: '+91 80 4567 8900',
  address: '42, Residency Road, Bengaluru 560025',
  freeShippingThreshold: 499,
  shippingFee: 49,
  codEnabled: true,
  codMaxOrder: 5000,
  lowStockDefault: 10,
}

export type Settings = typeof settingDefaults

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany()
  const out: Record<string, unknown> = { ...settingDefaults }
  for (const row of rows) if (row.key in settingDefaults) out[row.key] = row.value
  return out as Settings
}

export async function saveSettings(patch: Partial<Settings>) {
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } }),
    ),
  )
  return getSettings()
}
