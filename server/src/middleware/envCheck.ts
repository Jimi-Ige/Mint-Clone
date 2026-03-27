/**
 * Validates required environment variables at startup.
 * Fails fast with a clear error message if anything is missing.
 */
export function validateEnv(): void {
  const required: { key: string; hint: string }[] = [
    { key: 'DATABASE_URL', hint: 'PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db)' },
    { key: 'JWT_SECRET', hint: 'Secret for signing JWT tokens — use a random 256-bit value' },
  ];

  const optional: { key: string; hint: string }[] = [
    { key: 'PLAID_CLIENT_ID', hint: 'Plaid API client ID (required for bank linking)' },
    { key: 'PLAID_SECRET', hint: 'Plaid API secret key' },
    { key: 'PLAID_ENV', hint: 'Plaid environment: sandbox | development | production' },
    { key: 'ANTHROPIC_API_KEY', hint: 'Anthropic Claude API key (required for AI categorization)' },
    { key: 'PLAID_WEBHOOK_SECRET', hint: 'Plaid webhook verification secret' },
  ];

  const missing: string[] = [];

  for (const { key, hint } of required) {
    if (!process.env[key]) {
      missing.push(`  ${key} — ${hint}`);
    }
  }

  // Warn about weak JWT secret in production
  if (process.env.NODE_ENV === 'production') {
    const jwt = process.env.JWT_SECRET || '';
    if (jwt.length < 32 || jwt.includes('dev-secret') || jwt.includes('change')) {
      console.warn('[SECURITY] JWT_SECRET appears to be a weak/default value. Use a strong random secret in production.');
    }
  }

  if (missing.length > 0) {
    console.error('\n[ENV] Missing required environment variables:\n' + missing.join('\n'));
    console.error('\nCopy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }

  // Log optional missing vars as warnings (not errors)
  const missingOptional = optional.filter(({ key }) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('[ENV] Optional variables not set (some features may be unavailable):');
    missingOptional.forEach(({ key, hint }) => console.warn(`  ${key} — ${hint}`));
  }
}
