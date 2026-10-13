// Placeholder settings so the unit tests can load the app config without a real .env.
const defaults = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'test-service-key-not-real-0000000000',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  PASSWORD_PEPPER: 'test-pepper-0123456789abcdef0123456789abcdef',
}
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value
