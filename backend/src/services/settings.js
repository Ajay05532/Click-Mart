import { exec, from, rows } from '../database/db.js'
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
  businessName: '',
  gstin: '',
  businessState: 'Bihar',
  // Empty means "deliver everywhere in India" (the current storefront copy). Add a 6-digit PIN or a state
  // name here to mark it as not serviceable; checked by GET /geo/pin, /geo/search and /geo/reverse.
  nonServiceablePincodes: [],
  nonServiceableStates: [],
  // The 6-digit PIN NimbusPost ships from (your pickup warehouse). Required for live serviceability checks;
  // without it, the checks above (an admin block-list) are the only ones that run.
  pickupPincode: '',
  // The NimbusPost warehouse id (or code) orders are booked from. Required to create a NimbusPost order;
  // pick one from GET /admin/nimbuspost/warehouses, or add one from Settings -> Delivery first.
  nimbuspostWarehouseId: '',
}
/** Sample values an older schema.sql wrote. They are never real, so they fall back to the defaults above. */
const OLD_SAMPLES = {
  supportEmail: 'hello@clickmart.com',
  supportPhone: '+91 80 4567 8900',
  address: '42, Residency Road, Bengaluru 560025',
}
export async function getSettings() {
  const data = await rows(from('Setting').select('key, value'))
  const out = {
    ...settingDefaults,
  }
  for (const row of data) {
    if (!(row.key in settingDefaults)) continue
    if (OLD_SAMPLES[row.key] === row.value) continue
    if (row.key === 'businessState' && row.value === '') continue
    out[row.key] = row.value
  }
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
