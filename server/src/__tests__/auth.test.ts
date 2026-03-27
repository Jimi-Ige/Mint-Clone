import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authMiddleware, generateToken } from '../middleware/auth';

describe('generateToken', () => {
  it('should generate a valid JWT token', () => {
    const token = generateToken(42);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-in-production') as any;
    expect(decoded.userId).toBe(42);
  });

  it('should set a 7-day expiry', () => {
    const token = generateToken(1);
    const decoded = jwt.decode(token) as any;
    const expiresIn = decoded.exp - decoded.iat;
    expect(expiresIn).toBe(7 * 24 * 60 * 60);
  });

  it('should generate unique tokens for different users', () => {
    const token1 = generateToken(1);
    const token2 = generateToken(2);
    expect(token1).not.toBe(token2);
  });
});

describe('authMiddleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should reject requests without authorization header', () => {
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject requests with malformed authorization header', () => {
    req.headers.authorization = 'Basic abc123';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject requests with invalid token', () => {
    req.headers.authorization = 'Bearer invalid-token';
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept requests with valid token and set userId', () => {
    const token = generateToken(99);
    req.headers.authorization = `Bearer ${token}`;
    authMiddleware(req, res, next);
    expect(req.userId).toBe(99);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject expired tokens', () => {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '-1s' });
    req.headers.authorization = `Bearer ${token}`;
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
