import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser, createTestAccount, createTestCategory, createTestTransaction } from './helpers';

const app = getTestApp();

beforeAll(async () => { await setupDatabase(); });
afterEach(async () => { await cleanDatabase(); });
afterAll(async () => { await closeDatabase(); });

describe('GET /api/transactions', () => {
  it('returns empty for new user', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/transactions').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
  });

  it('returns user transactions with pagination', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id);
    const category = await createTestCategory(user.id);

    for (let i = 0; i < 5; i++) {
      await createTestTransaction(user.id, account.id, category.id, { description: `Txn ${i}` });
    }

    const res = await request(app)
      .get('/api/transactions?limit=3&offset=0')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(3);
    expect(res.body.total).toBe(5);
  });

  it('filters by type', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id);
    const category = await createTestCategory(user.id);

    await createTestTransaction(user.id, account.id, category.id, { type: 'expense', amount: 50 });
    await createTestTransaction(user.id, account.id, category.id, { type: 'income', amount: 100 });

    const res = await request(app)
      .get('/api/transactions?type=income')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].type).toBe('income');
  });

  it('does not return other users transactions', async () => {
    const { user: user1 } = await createTestUser({ email: 'a@test.com' });
    const { token: token2 } = await createTestUser({ email: 'b@test.com' });
    const account = await createTestAccount(user1.id);
    const category = await createTestCategory(user1.id);
    await createTestTransaction(user1.id, account.id, category.id);

    const res = await request(app).get('/api/transactions').set('Authorization', `Bearer ${token2}`);
    expect(res.body.transactions).toHaveLength(0);
  });
});

describe('POST /api/transactions', () => {
  it('creates a transaction and updates account balance', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id, { balance: 1000 });
    const category = await createTestCategory(user.id);

    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: account.id,
        category_id: category.id,
        amount: 200,
        type: 'expense',
        description: 'Groceries',
        date: '2026-03-27',
      });

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.amount)).toBe(200);

    // Verify balance updated
    const accounts = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(parseFloat(accounts.body[0].balance)).toBe(800); // 1000 - 200
  });

  it('increases balance for income', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id, { balance: 1000 });
    const category = await createTestCategory(user.id, { type: 'income' });

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: account.id,
        category_id: category.id,
        amount: 500,
        type: 'income',
        description: 'Salary',
        date: '2026-03-27',
      });

    const accounts = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(parseFloat(accounts.body[0].balance)).toBe(1500); // 1000 + 500
  });

  it('rejects missing required fields', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Missing fields' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('deletes transaction and reverses balance', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id, { balance: 1000 });
    const category = await createTestCategory(user.id);
    const txn = await createTestTransaction(user.id, account.id, category.id, { amount: 200, type: 'expense' });

    // Manually update balance as the helper doesn't go through the API
    const pool = (await import('../db/connection')).default;
    await pool.query('UPDATE accounts SET balance = 800 WHERE id = $1', [account.id]);

    const res = await request(app)
      .delete(`/api/transactions/${txn.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Balance should be restored
    const accounts = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(parseFloat(accounts.body[0].balance)).toBe(1000);
  });
});
