import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb, signup } from './helpers.js';
import { computeLeaderboard } from '../services/arenaStats.js';
import { prettyModelName } from '../config/models.js';

const side = (model, score, extra = {}) => ({ id: `groq:${model}`, name: model, provider: 'groq', model, score, ms: 2000, risk: { level: 'low' }, ...extra });
const battle = (a, b, winner, at) => ({ createdAt: new Date(at), battle: { a, b, winner } });

describe('friendly model names', () => {
  it('prettifies model ids', () => {
    expect(prettyModelName('openai/gpt-oss-120b')).toBe('GPT-OSS 120B');
    expect(prettyModelName('ministral-14b-latest')).toBe('Ministral 14B');
    expect(prettyModelName('gemini-3.8-flash')).toBe('Gemini 3.8 Flash');
    expect(prettyModelName('qwen/qwen3.8-27b')).toBe('Qwen3.8 27B');
    expect(prettyModelName('gemini-3.5-flash-lite')).toBe('Gemini 3.5 Flash Lite');
  });
});

describe('the Shastrarth leaderboard', () => {
  it('rates models with Elo from the battle results, in time order', () => {
    const chats = [
      { messages: [battle(side('M1', 9), side('M2', 6), 'a', '2026-01-01'), battle(side('M1', 8.5), side('M2', 5), 'a', '2026-01-02'), battle(side('M1', 7), side('M3', 7.2), 'tie', '2026-01-03')] },
    ];
    const r = computeLeaderboard(chats);
    expect(r.battles).toBe(3);
    const by = Object.fromEntries(r.leaderboard.map((x) => [x.name, x]));
    expect(r.leaderboard[0].name).toBe('M1');
    expect(by.M1).toMatchObject({ wins: 2, ties: 1, losses: 0, battles: 3 });
    expect(by.M2).toMatchObject({ wins: 0, losses: 2 });
    expect(by.M1.elo).toBeGreaterThan(1000);
    expect(by.M2.elo).toBeLessThan(1000);
    expect(by.M1.avgScore).toBe(8.2);
    expect(by.M1.avgSeconds).toBe(2);
    // Elo is zero-sum
    expect(r.leaderboard.reduce((s, x) => s + x.elo, 0)).toBeCloseTo(3000, -1);
    expect(r.recent[0].a).toBe('M1');
  });

  it('ignores unscored battles and counts the model that really answered, not the level asked for', () => {
    const fellBack = side('lite', 9, { answeredBy: { provider: 'mistral', model: 'ministral-14b-latest' } });
    const chats = [{ messages: [battle(fellBack, side('M2', 4), 'a', '2026-02-01'), battle(side('M1', undefined), side('M2', 5), null, '2026-02-02'), { createdAt: new Date(), role: 'user' }] }];
    const r = computeLeaderboard(chats);
    expect(r.battles).toBe(1);
    expect(r.leaderboard.map((x) => x.name)).toEqual(['Ministral 14B', 'M2']);
  });

  it('reads battles saved under the old name "compare"', () => {
    const old = { createdAt: new Date('2026-03-01'), compare: { a: side('x', 9), b: side('y', 3), winner: 'a' } };
    expect(computeLeaderboard([{ messages: [old] }]).battles).toBe(1);
  });

  it('is empty without battles', () => {
    expect(computeLeaderboard([])).toEqual({ battles: 0, leaderboard: [], recent: [] });
  });
});

describe('GET /api/profile/arena', () => {
  let stop, app, cookie, Chat, User;
  beforeAll(async () => {
    stop = await startDb();
    const { createApp } = await import('../src/app.js');
    ({ default: Chat } = await import('../models/Chat.js'));
    ({ default: User } = await import('../models/User.js'));
    app = createApp({ ai: { configError: () => null, tiers: () => [] } });
    cookie = await signup(app, 1);
  }, 120000);
  afterAll(() => stop());

  it('needs a login, and returns the ratings from the user’s saved battles', async () => {
    expect((await request(app).get('/api/profile/arena')).status).toBe(401);
    const user = await User.findOne({ email: 'user1@example.com' });
    await Chat.create({
      userId: user._id,
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a', battle: { a: { ...side('M1', 9), content: 'long text'.repeat(100) }, b: side('M2', 4), winner: 'a' } },
      ],
    });
    const res = await request(app).get('/api/profile/arena').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.battles).toBe(1);
    expect(res.body.leaderboard.map((x) => x.name)).toEqual(['M1', 'M2']);
    expect(JSON.stringify(res.body)).not.toContain('long text'); // only the numbers are read, never the answers
    // another user sees nothing of it
    const other = await signup(app, 2);
    expect((await request(app).get('/api/profile/arena').set('Cookie', other)).body.battles).toBe(0);
    await mongoose.connection.db.dropDatabase();
  });
});
