import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { SUPPORTED_CURRENCIES, fetchAndCacheRates, convertAmount } from '../services/exchangeRates';

const router = Router();

// GET /api/currency/supported — list all supported currencies
router.get('/supported', (_req: AuthRequest, res: Response) => {
  res.json(SUPPORTED_CURRENCIES);
});

// GET /api/currency/rates?base=USD — get current rates for a base currency
router.get('/rates', async (req: AuthRequest, res: Response) => {
  try {
    const baseCurrency = (req.query.base as string) || 'USD';
    const rates = await fetchAndCacheRates(baseCurrency);
    res.json({ base: baseCurrency, rates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exchange rates' });
  }
});

// GET /api/currency/convert?amount=100&from=EUR&to=USD — convert a specific amount
router.get('/convert', async (req: AuthRequest, res: Response) => {
  try {
    const { amount, from, to } = req.query;
    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'amount, from, and to are required' });
    }
    const converted = await convertAmount(Number(amount), from as string, to as string);
    res.json({ amount: Number(amount), from, to, converted, rate: converted / Number(amount) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert amount' });
  }
});

// GET /api/currency/preference — get user's base currency
router.get('/preference', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT base_currency FROM users WHERE id = $1', [req.userId]);
    res.json({ base_currency: result.rows[0]?.base_currency || 'USD' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get currency preference' });
  }
});

// PUT /api/currency/preference — set user's base currency
router.put('/preference', async (req: AuthRequest, res: Response) => {
  try {
    const { base_currency } = req.body;
    if (!base_currency) return res.status(400).json({ error: 'base_currency is required' });

    const valid = SUPPORTED_CURRENCIES.some(c => c.code === base_currency);
    if (!valid) return res.status(400).json({ error: 'Unsupported currency' });

    await pool.query('UPDATE users SET base_currency = $1 WHERE id = $2', [base_currency, req.userId]);
    res.json({ base_currency });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update currency preference' });
  }
});

export default router;
