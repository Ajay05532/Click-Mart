import { exec, from, rows } from '../database/db.js'
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
  businessName: '',
  gstin: '',
  businessState: '',
}
export async function getSettings() {
  const data = await rows(from('Setting').select('key, value'))
  const out = {
    ...settingDefaults,
  }
  for (const row of data) if (row.key in settingDefaults) out[row.key] = row.value
  return out
}
export async function saveSettings(patch) {
  const entries = Object.entries(patch).map(([key, value]) => ({
    key,
    value,
  }))
  if (entries.length)
    await exec(
      from('Setting').upsert(entries, {
        onConflict: 'key',
      }),
    )
  return getSettings()
}
