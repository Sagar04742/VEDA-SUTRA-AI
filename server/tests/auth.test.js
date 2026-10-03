import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb } from './helpers.js';

let stop, app, errorBody;
const user = { name: 'Arya', email: 'arya@example.com', password: 'password123' };

beforeAll(async () => {
  stop = await startDb();
  const { createApp } = await import('../src/app.js');
  ({ errorBody } = await import('../middleware/errorHandler.js'));
  app = createApp();
}, 120000);
afterAll(() => stop());
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('token='));

describe('auth', () => {
  it('signs up, hashes the password, sets an httpOnly cookie, and is logged in', async () => {
    const res = await request(app).post('/api/auth/signup').send(user);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Arya', email: 'arya@example.com' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieOf(res)).toMatch(/HttpOnly/i);

    const stored = await mongoose.model('User').findOne({ email: user.email }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(user.password);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    await request(app).post('/api/auth/signup').send(user);
    const res = await request(app).post('/api/auth/signup').send({ ...user, email: 'ARYA@example.com' });
    expect(res.status).toBe(409);
  });

  it('validates input', async () => {
    const bad = [{ ...user, email: 'nope' }, { ...user, password: 'short' }, { ...user, name: '' }, {}];
    for (const body of bad) {
      expect((await request(app).post('/api/auth/signup').send(body)).status).toBe(400);
    }
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app).post('/api/auth/signup').send(user);
    const ok = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toBeTruthy();

    const wrongPw = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrongpass1' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'whatever12' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error).toBe(noUser.body.error);
  });

  it('protects /me and clears the cookie on logout', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', 'token=garbage')).status).toBe(401);

    const out = await request(app).post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'][0]).toMatch(/token=;/);
  });

  it('hides stack traces and internals for server errors in production', () => {
    const err = new Error('db password leaked');
    expect(errorBody(err, true).body).toEqual({ error: 'Something went wrong' });
    expect(errorBody(err, false).body.stack).toBeDefined();
    expect(errorBody({ status: 400, message: 'bad' }, true).body).toEqual({ error: 'bad' });
  });
});
