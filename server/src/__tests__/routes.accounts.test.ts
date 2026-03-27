import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser, createTestAccount } from './helpers';

const app = getTestApp();

beforeAll(async () => { await setupDatabase(); });
afterEach(async () => { await cleanDatabase(); });
afterAll(async () => { await closeDatabase(); });

describe('GET /api/accounts', () => {
  it('returns empty array for new user', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns user accounts', async () => {
    const { user, token } = await createTestUser();
    await createTestAccount(user.id, { name: 'Checking', balance: 5000 });
    await createTestAccount(user.id, { name: 'Savings', type: 'savings', balance: 10000 });

    const res = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('does not return other users accounts', async () => {
    const { user: user1 } = await createTestUser({ email: 'a@test.com' });
    const { token: token2 } = await createTestUser({ email: 'b@test.com' });
    await createTestAccount(user1.id, { name: 'Private Account' });

    const res = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/accounts', () => {
  it('creates a new account', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Account', type: 'checking', balance: 2500, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Account');
    expect(parseFloat(res.body.balance)).toBe(2500);
  });

  it('rejects missing name', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'checking', balance: 100 });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/accounts/:id', () => {
  it('updates account name', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id);

    const res = await request(app)
      .put(`/api/accounts/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', type: 'checking', balance: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  it('cannot update another users account', async () => {
    const { user: user1 } = await createTestUser({ email: 'owner@test.com' });
    const { token: token2 } = await createTestUser({ email: 'other@test.com' });
    const account = await createTestAccount(user1.id);

    const res = await request(app)
      .put(`/api/accounts/${account.id}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'Stolen', type: 'checking', balance: 0 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/accounts/:id', () => {
  it('deletes own account', async () => {
    const { user, token } = await createTestUser();
    const account = await createTestAccount(user.id);

    const res = await request(app)
      .delete(`/api/accounts/${account.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const list = await request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });

  it('cannot delete another users account', async () => {
    const { user: user1 } = await createTestUser({ email: 'owner2@test.com' });
    const { token: token2 } = await createTestUser({ email: 'other2@test.com' });
    const account = await createTestAccount(user1.id);

    const res = await request(app)
      .delete(`/api/accounts/${account.id}`)
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });
});
