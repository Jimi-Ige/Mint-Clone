import request from 'supertest';
import { getTestApp, setupDatabase, cleanDatabase, closeDatabase, createTestUser } from './helpers';

const app = getTestApp();

beforeAll(async () => { await setupDatabase(); });
afterEach(async () => { await cleanDatabase(); });
afterAll(async () => { await closeDatabase(); });

describe('GET /api/goals', () => {
  it('returns empty for new user', async () => {
    const { token } = await createTestUser();
    const res = await request(app).get('/api/goals').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/goals', () => {
  it('creates a savings goal', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Emergency Fund', target_amount: 10000 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Emergency Fund');
    expect(parseFloat(res.body.target_amount)).toBe(10000);
    expect(parseFloat(res.body.current_amount)).toBe(0);
  });
});

describe('PATCH /api/goals/:id/contribute', () => {
  it('adds contribution to goal', async () => {
    const { token } = await createTestUser();
    const goal = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Vacation', target_amount: 2000 });

    const res = await request(app)
      .patch(`/api/goals/${goal.body.id}/contribute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500 });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.current_amount)).toBe(500);
  });

  it('marks goal as completed when target reached', async () => {
    const { token } = await createTestUser();
    const goal = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Small Goal', target_amount: 100 });

    const res = await request(app)
      .patch(`/api/goals/${goal.body.id}/contribute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('rejects negative contribution', async () => {
    const { token } = await createTestUser();
    const goal = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', target_amount: 1000 });

    const res = await request(app)
      .patch(`/api/goals/${goal.body.id}/contribute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -50 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/goals/:id', () => {
  it('deletes a goal', async () => {
    const { token } = await createTestUser();
    const goal = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delete Me', target_amount: 500 });

    const res = await request(app)
      .delete(`/api/goals/${goal.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const list = await request(app).get('/api/goals').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });
});
