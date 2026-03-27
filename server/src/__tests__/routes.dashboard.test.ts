import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser, createTestAccount, createTestCategory, createTestTransaction } from './helpers';

const app = getTestApp();

beforeAll(async () => { await setupDatabase(); });
afterEach(async () => { await cleanDatabase(); });
afterAll(async () => { await closeDatabase(); });

describe('GET /api/dashboard', () => {
  it('returns dashboard data for user with no data', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalBalance');
    expect(res.body).toHaveProperty('monthlyIncome');
    expect(res.body).toHaveProperty('monthlyExpenses');
  });

  it('calculates correct totals', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id, { balance: 5000 });
    const expenseCat = await createTestCategory(user.id, { name: 'Food', type: 'expense' });
    const incomeCat = await createTestCategory(user.id, { name: 'Salary', type: 'income' });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;

    await createTestTransaction(user.id, account.id, expenseCat.id, { amount: 300, type: 'expense', date: thisMonth });
    await createTestTransaction(user.id, account.id, incomeCat.id, { amount: 2000, type: 'income', date: thisMonth });

    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.totalBalance)).toBe(5000);
    expect(parseFloat(res.body.monthlyExpenses)).toBeGreaterThanOrEqual(300);
    expect(parseFloat(res.body.monthlyIncome)).toBeGreaterThanOrEqual(2000);
  });

  it('isolates data between users', async () => {
    const { user: user1 } = await createTestUser({ email: 'rich@test.com' });
    const { token: token2 } = await createTestUser({ email: 'new@test.com' });
    await createTestAccount(user1.id, { balance: 999999 });

    const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token2}`);
    expect(parseFloat(res.body.totalBalance)).toBe(0);
  });
});
