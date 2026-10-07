import { prisma } from './prisma.js'

export const settingDefaults = {
  storeName: 'ClickMart',
  supportEmail: 'tanusharmaa79@gmail.com',
  supportPhone: '+91 93048 37512',
  address: 'Ground Floor, Kashyap Sadan, Near Shemford School, Sampatchak, Jaganpura–Udaini Road, Patna, Bihar 804453',
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
