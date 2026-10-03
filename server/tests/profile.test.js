import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startDb, signup } from './helpers.js';
import { computeProfileStats, classify, languageOf, levelFor } from '../services/profile.js';

const NOW = new Date('2026-10-10T12:00:00Z');
const at = (iso) => new Date(iso);
const q = (content, iso, extra = {}) => ({ role: 'user', content, createdAt: at(iso), ...extra });
const a = (content, iso, extra = {}) => ({ role: 'assistant', content, createdAt: at(iso), ...extra });
const solved = { solver: [{ method: 'nikhilam', answer: '9506', steps: ['x'] }] };

describe('classification', () => {
  it('uses the solver result first, then topic words', () => {
    expect(classify('Multiply 98 × 97', { solver: [{}] })).toBe('calculation');
    expect(classify('What is Nikhilam?', { solver: [] })).toBe('vedic');
    expect(classify('वैदिक गणित क्या है?', null)).toBe('vedic');
    expect(classify('What did Aryabhata write?', null)).toBe('ancient');
    expect(classify('Tell me about the Delhi Iron Pillar', null)).toBe('ancient');
    expect(classify('hello there', null)).toBe('other');
  });
  it('detects scripts', () => {
    expect(languageOf('What is zero?')).toBe('English / Latin script');
    expect(languageOf('शून्य क्या है?')).toBe('Hindi / Sanskrit (Devanagari)');
    expect(languageOf('தமிழ்')).toBe('Other Indian scripts');
  });
  it('maps question counts to a level with progress', () => {
    expect(levelFor(0)).toMatchObject({ title: 'Newcomer', next: { title: 'Curious Learner', at: 1 } });
    expect(levelFor(10).title).toBe('Seeker');
    expect(levelFor(20)).toMatchObject({ title: 'Seeker', next: { at: 30 }, progress: 0.5 });
    expect(levelFor(500)).toMatchObject({ title: 'Acharya', next: null, progress: 1 });
  });
});

describe('computeProfileStats', () => {
  const chats = [
    {
      _id: 'c1',
      messages: [
        q('Multiply 98 × 97', '2026-10-08T09:00:00Z'), a('9506', '2026-10-08T09:00:05Z', solved),
        q('What is Nikhilam?', '2026-10-09T10:00:00Z'), a('...', '2026-10-09T10:00:05Z'),
      ],
    },
    {
      _id: 'c2',
      messages: [
        q('What is the Delhi Iron Pillar?', '2026-10-10T08:00:00Z', { images: [{ imageId: 'i' }] }), a('...', '2026-10-10T08:00:05Z'),
        q('शून्य क्या है?', '2026-10-10T08:05:00Z'), a('...', '2026-10-10T08:05:05Z'),
      ],
    },
    { _id: 'c3', messages: [] },
  ];
  const s = computeProfileStats(chats, { now: NOW });

  it('counts questions, answers, chats and pictures', () => {
    expect(s.totals).toMatchObject({ chats: 2, questions: 4, answers: 4, calculations: 1, withPictures: 1, activeDays: 3 });
    expect(s.recent[0].text).toBe('शून्य क्या है?'); // newest first
    expect(s.recent[0].chatId).toBe('c2');
  });
  it('builds the learning mix, techniques and languages', () => {
    expect(s.mix).toEqual({ calculation: 1, vedic: 1, ancient: 2, other: 0 });
    expect(s.techniques).toEqual([{ name: 'nikhilam', count: 1 }]);
    expect(s.languages).toEqual([{ name: 'English / Latin script', count: 3 }, { name: 'Hindi / Sanskrit (Devanagari)', count: 1 }]);
  });
  it('lists the last 14 days with zeros and counts per day', () => {
    expect(s.perDay).toHaveLength(14);
    expect(s.perDay.at(-1)).toEqual({ date: '2026-10-10', questions: 2 });
    expect(s.perDay.at(-2)).toEqual({ date: '2026-10-09', questions: 1 });
    expect(s.perDay[0]).toEqual({ date: '2026-09-27', questions: 0 });
  });
  it('computes streaks (three days in a row, ending today)', () => {
    expect(s.streak).toEqual({ current: 3, longest: 3 });
  });
  it('awards badges only for what really happened', () => {
    const earned = s.badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(['first', 'explorer', 'polyglot', 'picture', 'streak']);
    expect(earned).not.toContain('curious');
    expect(earned).not.toContain('wizard');
  });
  it('a streak that ended yesterday is still current, one that ended earlier is not', () => {
    const one = (iso) => [{ _id: 'x', messages: [q('hi', iso), a('hi', iso)] }];
    expect(computeProfileStats(one('2026-10-09T10:00:00Z'), { now: NOW }).streak.current).toBe(1);
    expect(computeProfileStats(one('2026-10-07T10:00:00Z'), { now: NOW }).streak).toEqual({ current: 0, longest: 1 });
  });
  it('respects the time zone when assigning days', () => {
    // 20:00 UTC on the 9th is already the 10th in India (UTC+5:30 -> getTimezoneOffset() = -330)
    const late = [{ _id: 'x', messages: [q('hi', '2026-10-09T20:00:00Z'), a('ok', '2026-10-09T20:00:05Z')] }];
    expect(computeProfileStats(late, { now: NOW, tzOffset: 0 }).perDay.at(-2).questions).toBe(1);
    expect(computeProfileStats(late, { now: NOW, tzOffset: -330 }).perDay.at(-1).questions).toBe(1);
  });
  it('handles a brand-new user', () => {
    const e = computeProfileStats([], { now: NOW });
    expect(e.totals.questions).toBe(0);
    expect(e.firstQuestionAt).toBeNull();
    expect(e.level.title).toBe('Newcomer');
    expect(e.streak).toEqual({ current: 0, longest: 0 });
    expect(e.badges.every((b) => !b.earned)).toBe(true);
  });
});

describe('profile and public stats endpoints', () => {
  let stop, app, Chat, Knowledge, cookieA, cookieB;
  beforeAll(async () => {
    stop = await startDb();
    const { createApp } = await import('../src/app.js');
    ({ default: Chat } = await import('../models/Chat.js'));
    ({ default: Knowledge } = await import('../models/Knowledge.js'));
    app = createApp({ ai: { configError: () => null, tiers: () => [] } });
  }, 120000);
  afterAll(() => stop());
  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    cookieA = await signup(app, 1);
    cookieB = await signup(app, 2);
  });

  it("returns only the signed-in user's own analytics", async () => {
    const { default: User } = await import('../models/User.js');
    const [ua, ub] = await Promise.all([User.findOne({ email: 'user1@example.com' }), User.findOne({ email: 'user2@example.com' })]);
    await Chat.create({ userId: ua._id, messages: [q('What is Nikhilam?', new Date().toISOString()), a('A sutra.', new Date().toISOString())] });
    await Chat.create({ userId: ub._id, messages: [q('Secret question of B', new Date().toISOString()), a('x', new Date().toISOString())] });

    const res = await request(app).get('/api/profile/stats?tz=-330').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'User 1', email: 'user1@example.com' });
    expect(res.body.stats.totals.questions).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('Secret question of B');
    expect(res.body.stats.perDay).toHaveLength(14);
  });

  it('requires login, and tolerates a silly tz value', async () => {
    expect((await request(app).get('/api/profile/stats')).status).toBe(401);
    expect((await request(app).get('/api/profile/stats?tz=banana').set('Cookie', cookieA)).status).toBe(200);
    expect((await request(app).get('/api/profile/stats?tz=999999').set('Cookie', cookieA)).status).toBe(200);
  });

  it('the home page can read public library numbers without logging in', async () => {
    await Knowledge.insertMany([
      { name: 'A', source: 's', provenance: 'verified_math', category: 'sutra' },
      { name: 'B', source: 's', provenance: 'verified_math', category: 'sutra' },
      { name: 'C', source: 's', provenance: 'interpretation', category: 'astronomy' },
    ]);
    const { resetPublicStatsCache } = await import('../routes/profile.js');
    resetPublicStatsCache();
    const res = await request(app).get('/api/stats/public');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ knowledgeEntries: 3, topicAreas: 2 });
    expect(Object.keys(res.body)).toEqual(['knowledgeEntries', 'topicAreas']); // nothing private
  });
});
