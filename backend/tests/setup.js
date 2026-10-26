// Placeholder settings so the unit tests can load the app config without a real .env.
const defaults = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'test-service-key-not-real-0000000000',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  SUPPORT_INBOUND_EMAIL: 'support@inbound.example.com',
  SUPPORT_INBOUND_SECRET: 'test-inbound-secret-0123456789',
  PASSWORD_PEPPER: 'test-pepper-0123456789abcdef0123456789abcdef',
  NIMBUSPOST_WEBHOOK_SECRET: 'test-nimbus-webhook-secret-0123',
}
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value
