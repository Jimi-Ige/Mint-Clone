import pool from '../db/connection';

// Supported currencies
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '\u20ac' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00a3' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00a5' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00a5' },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20b9' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '\u20a9' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20a6' },
];

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code);

// In-memory cache for rates (avoids hitting DB every time)
const rateCache: Map<string, { rate: number; timestamp: number }> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch exchange rates from Frankfurter API and cache them
 */
export async function fetchAndCacheRates(baseCurrency: string): Promise<Record<string, number>> {
  const today = new Date().toISOString().split('T')[0];

  // Check if we already have today's rates in DB
  const { rows: existing } = await pool.query(
    'SELECT target_currency, rate FROM exchange_rates WHERE base_currency = $1 AND date = $2',
    [baseCurrency, today]
  );

  if (existing.length >= CURRENCY_CODES.length - 1) {
    const rates: Record<string, number> = { [baseCurrency]: 1 };
    existing.forEach((r: any) => { rates[r.target_currency] = parseFloat(r.rate); });
    // Update memory cache
    for (const [code, rate] of Object.entries(rates)) {
      rateCache.set(`${baseCurrency}:${code}`, { rate, timestamp: Date.now() });
    }
    return rates;
  }

  // Fetch from Frankfurter API
  try {
    const targets = CURRENCY_CODES.filter(c => c !== baseCurrency).join(',');
    const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}&to=${targets}`);

    if (!response.ok) {
      throw new Error(`Frankfurter API returned ${response.status}`);
    }

    const data = await response.json() as { rates: Record<string, number> };
    const rates: Record<string, number> = { [baseCurrency]: 1, ...data.rates };

    // Store in database
    for (const [currency, rate] of Object.entries(data.rates)) {
      await pool.query(
        `INSERT INTO exchange_rates (base_currency, target_currency, rate, date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (base_currency, target_currency, date) DO UPDATE SET rate = $3, updated_at = NOW()`,
        [baseCurrency, currency, rate, today]
      );
    }

    // Update memory cache
    for (const [code, rate] of Object.entries(rates)) {
      rateCache.set(`${baseCurrency}:${code}`, { rate, timestamp: Date.now() });
    }

    return rates;
  } catch (err) {
    // Fallback: try to get most recent rates from DB
    const { rows: fallback } = await pool.query(
      `SELECT DISTINCT ON (target_currency) target_currency, rate
       FROM exchange_rates WHERE base_currency = $1
       ORDER BY target_currency, date DESC`,
      [baseCurrency]
    );

    if (fallback.length > 0) {
      const rates: Record<string, number> = { [baseCurrency]: 1 };
      fallback.forEach((r: any) => { rates[r.target_currency] = parseFloat(r.rate); });
      return rates;
    }

    // Last resort: return 1:1 rates
    console.error('Failed to fetch exchange rates:', err);
    const rates: Record<string, number> = {};
    CURRENCY_CODES.forEach(c => { rates[c] = 1; });
    return rates;
  }
}

/**
 * Get a single conversion rate (uses memory cache first)
 */
export async function getRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `${from}:${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.rate;
  }

  // Fetch all rates for the source currency
  const rates = await fetchAndCacheRates(from);
  return rates[to] || 1;
}

/**
 * Convert an amount from one currency to another
 */
export async function convertAmount(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rate = await getRate(from, to);
  return amount * rate;
}

/**
 * Convert multiple amounts efficiently (fetches rates once)
 */
export async function convertAmounts(
  items: Array<{ amount: number; currency: string }>,
  targetCurrency: string
): Promise<number[]> {
  const uniqueCurrencies = [...new Set(items.map(i => i.currency))];

  // If all same currency as target, no conversion needed
  if (uniqueCurrencies.length === 1 && uniqueCurrencies[0] === targetCurrency) {
    return items.map(i => i.amount);
  }

  // Get all needed rates
  const rates: Record<string, number> = { [targetCurrency]: 1 };
  for (const currency of uniqueCurrencies) {
    if (currency !== targetCurrency) {
      rates[currency] = await getRate(currency, targetCurrency);
    }
  }

  return items.map(i => i.amount * (rates[i.currency] || 1));
}
