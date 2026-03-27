import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser, createTestAccount, createTestCategory, createTestTransaction } from './helpers';

const app = getTestApp();

beforeAll(async () => { await setupDatabase(); });
afterEach(async () => { await cleanDatabase(); });
afterAll(async () => { await closeDatabase(); });

describe('GET /api/budgets', () => {
  it('returns empty for new user', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/budgets').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/budgets', () => {
  it('creates a budget', async () => {
    const { user, token } = await createTestUser();
    const category = await createTestCategory(user.id);

    const res = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_id: category.id, amount: 500, month: 3, year: 2026 });

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.amount)).toBe(500);
    expect(res.body.month).toBe(3);
  });

  it('rejects missing fields', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500 });

    expect(res.status).toBe(400);
  });
});

describe('Budget spent tracking', () => {
  it('tracks spending against budget', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id);
    const category = await createTestCategory(user.id);

    // Create budget for March 2026
    await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category_id: category.id, amount: 500, month: 3, year: 2026 });

    // Create expense in March
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: account.id,
        category_id: category.id,
        amount: 200,
        type: 'expense',
        description: 'Test expense',
        date: '2026-03-15',
      });

    // Check budget shows spent amount
    const res = await request(app)
      .get('/api/budgets?month=3&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(parseFloat(res.body[0].spent)).toBeGreaterThanOrEqual(200);
  });
});
