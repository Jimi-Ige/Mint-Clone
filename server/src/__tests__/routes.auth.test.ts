import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser } from './helpers';

const app = getTestApp();

beforeAll(async () => {
  await setupDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe('POST /api/auth/register', () => {
  it('creates a new user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'Test1234', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.com');
    expect(res.body.user.name).toBe('New User');
    expect(res.body.token).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    await createTestUser({ email: 'dup@test.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', password: 'Test1234', name: 'Dup' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('rejects weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@test.com', password: 'short', name: 'Weak' });

    expect(res.status).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no@test.com' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await createTestUser({ email: 'login@test.com', password: 'Test1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'Test1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
  });

  it('rejects wrong password', async () => {
    await createTestUser({ email: 'wrong@test.com', password: 'Test1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@test.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
  });

  it('rejects nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@test.com', password: 'Test1234' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user with valid token', async () => {
    const { token } = await createTestUser({ email: 'me@test.com', name: 'Me' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@test.com');
    expect(res.body.name).toBe('Me');
    expect(res.body.base_currency).toBe('USD');
    expect(res.body.onboarding_completed).toBe(false);
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/onboarding', () => {
  it('marks onboarding as complete', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .put('/api/auth/onboarding')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.onboarding_completed).toBe(true);

    // Verify it persists
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.body.onboarding_completed).toBe(true);
  });
});
