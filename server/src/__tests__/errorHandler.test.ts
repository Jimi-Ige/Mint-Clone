import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler';

describe('errorHandler', () => {
  it('should return 500 with error message', () => {
    const err = new Error('Something broke');
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    // Suppress console.error during test
    vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something broke' });
  });

  it('should use default message when error has no message', () => {
    const err = new Error();
    err.message = '';
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    vi.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
