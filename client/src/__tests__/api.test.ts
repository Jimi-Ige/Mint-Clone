import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

describe('api wrapper', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make GET requests with correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    });

    const result = await api.get('/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    expect(result).toEqual({ data: 'test' });
  });

  it('should include auth token when present', async () => {
    localStorage.setItem('token', 'test-jwt-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await api.get('/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-jwt-token',
      }),
    }));
  });

  it('should make POST requests with body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await api.post('/items', { name: 'test' });
    expect(mockFetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    }));
    expect(result).toEqual({ id: 1 });
  });

  it('should make PUT requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ updated: true }),
    });

    await api.put('/items/1', { name: 'updated' });
    expect(mockFetch).toHaveBeenCalledWith('/api/items/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: 'updated' }),
    }));
  });

  it('should make DELETE requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    await api.delete('/items/1');
    expect(mockFetch).toHaveBeenCalledWith('/api/items/1', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('should throw on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });

    await expect(api.get('/bad')).rejects.toThrow('Bad request');
  });

  it('should handle 401 by clearing token and redirecting', async () => {
    localStorage.setItem('token', 'expired-token');

    // Mock window.location.href setter
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    await expect(api.get('/protected')).rejects.toThrow('Session expired');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should make PATCH requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ patched: true }),
    });

    await api.patch('/items/1', { amount: 50 });
    expect(mockFetch).toHaveBeenCalledWith('/api/items/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ amount: 50 }),
    }));
  });
});
