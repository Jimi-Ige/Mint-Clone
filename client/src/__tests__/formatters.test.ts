import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatMonth, getCurrencySymbol } from '../lib/formatters';

describe('formatCurrency', () => {
  it('should format USD amounts correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('should format zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should format negative amounts', () => {
    expect(formatCurrency(-50.99)).toBe('-$50.99');
  });

  it('should format EUR amounts', () => {
    const result = formatCurrency(100, 'EUR');
    expect(result).toContain('100');
    expect(result).toContain('€');
  });

  it('should format GBP amounts', () => {
    const result = formatCurrency(100, 'GBP');
    expect(result).toContain('100');
    expect(result).toContain('£');
  });

  it('should handle large amounts', () => {
    const result = formatCurrency(1234567.89);
    expect(result).toBe('$1,234,567.89');
  });

  it('should default to USD when no currency specified', () => {
    expect(formatCurrency(100)).toBe('$100.00');
  });
});

describe('formatDate', () => {
  it('should format a date string with month, day, and year', () => {
    const result = formatDate('2024-06-15');
    // Date parsing may shift by timezone, so just check format includes month name and year
    expect(result).toMatch(/\w{3}\s+\d{1,2},\s+\d{4}/);
    expect(result).toContain('2024');
  });

  it('should format ISO date strings', () => {
    // Use noon UTC to avoid timezone date shifting
    const result = formatDate('2024-06-15T12:00:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });
});

describe('formatMonth', () => {
  it('should format month and year', () => {
    expect(formatMonth(1, 2024)).toContain('January');
    expect(formatMonth(1, 2024)).toContain('2024');
  });

  it('should format December', () => {
    expect(formatMonth(12, 2023)).toContain('December');
    expect(formatMonth(12, 2023)).toContain('2023');
  });

  it('should handle all months', () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    for (let i = 1; i <= 12; i++) {
      expect(formatMonth(i, 2024)).toContain(months[i - 1]);
    }
  });
});

describe('getCurrencySymbol', () => {
  it('should return $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('should return € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('should return £ for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('should return the currency code for unknown currencies', () => {
    expect(getCurrencySymbol('INVALID')).toBe('INVALID');
  });
});
