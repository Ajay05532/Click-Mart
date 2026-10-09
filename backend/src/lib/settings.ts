import { exec, from, rows } from './db.js'

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
  const data = await rows<{ key: string; value: unknown }>(from('Setting').select('key, value'))
  const out: Record<string, unknown> = { ...settingDefaults }
  for (const row of data) if (row.key in settingDefaults) out[row.key] = row.value
  return out as Settings
}

export async function saveSettings(patch: Partial<Settings>) {
  const entries = Object.entries(patch).map(([key, value]) => ({ key, value }))
  if (entries.length) await exec(from('Setting').upsert(entries, { onConflict: 'key' }))
  return getSettings()
}
