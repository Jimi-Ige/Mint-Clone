import { describe, it, expect } from 'vitest';
import { SUPPORTED_CURRENCIES } from '../services/exchangeRates';

describe('SUPPORTED_CURRENCIES', () => {
  it('should contain at least 10 currencies', () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(10);
  });

  it('should include USD, EUR, GBP', () => {
    const codes = SUPPORTED_CURRENCIES.map(c => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
  });

  it('should have code, name, and symbol for each currency', () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currency.code).toBeTruthy();
      expect(currency.code).toHaveLength(3);
      expect(currency.name).toBeTruthy();
      expect(currency.symbol).toBeTruthy();
    }
  });

  it('should have unique currency codes', () => {
    const codes = SUPPORTED_CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should include NGN (Nigerian Naira)', () => {
    const ngn = SUPPORTED_CURRENCIES.find(c => c.code === 'NGN');
    expect(ngn).toBeDefined();
    expect(ngn?.name).toBe('Nigerian Naira');
    expect(ngn?.symbol).toBe('₦');
  });
});
