// Learning analytics for the profile page. Everything is derived from the user's own saved chats;
// nothing is stored separately and nothing is guessed: counts come straight from the messages.

const VEDIC = /vedic|sutra|nikhilam|urdhva|yavadunam|ekadhikena|ekanyunena|paravartya|antyayor|vinculum|navasesha|casting out nines|digit sum|tirtha|वैदिक|सूत्र|निखिलम/i;
const ANCIENT = /ancient|astronom|ayurved|\bveda|aryabhata|brahmagupta|bhaskara|\bzero\b|shunya|metallurg|iron pillar|sulba|nakshatra|siddhanta|jyotish|sushruta|charaka|panini|pingala|madhava|kerala school|vastu|bakhshali|surya|खगोल|आयुर्वेद|प्राचीन|शून्य|नक्षत्र/i;

export const LEVELS = [
  { at: 0, title: 'Newcomer' },
  { at: 1, title: 'Curious Learner' },
  { at: 10, title: 'Seeker' },
  { at: 30, title: 'Scholar' },
  { at: 75, title: 'Pandit' },
  { at: 150, title: 'Acharya' },
];

// 'YYYY-MM-DD' of a timestamp in the user's time zone. tzOffset is JavaScript's getTimezoneOffset() (minutes behind UTC).
const dayOf = (ts, tzOffset) => new Date(new Date(ts).getTime() - tzOffset * 60000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function languageOf(text) {
  if (/[ऀ-ॿ]/.test(text)) return 'Hindi / Sanskrit (Devanagari)';
  if (/[ঀ-෿]/.test(text)) return 'Other Indian scripts';
  return 'English / Latin script';
}

export function classify(question, reply) {
  if (reply?.solver?.length) return 'calculation';
  if (VEDIC.test(question)) return 'vedic';
  if (ANCIENT.test(question)) return 'ancient';
  return 'other';
}

// Longest and current runs of consecutive active days.
function streaks(days, today) {
  const set = new Set(days);
  let longest = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // only start counting at the beginning of a run
    let len = 1;
    while (set.has(addDays(d, len))) len++;
    longest = Math.max(longest, len);
  }
  // The current streak may end today or yesterday (you have not asked today yet).
  let end = set.has(today) ? today : set.has(addDays(today, -1)) ? addDays(today, -1) : null;
  let current = 0;
  while (end && set.has(end)) {
    current++;
    end = addDays(end, -1);
  }
  return { current, longest };
}

export function levelFor(questions) {
  const idx = LEVELS.reduce((best, l, i) => (questions >= l.at ? i : best), 0);
  const next = LEVELS[idx + 1];
  return {
    title: LEVELS[idx].title,
    next: next ? { title: next.title, at: next.at } : null,
    progress: next ? (questions - LEVELS[idx].at) / (next.at - LEVELS[idx].at) : 1,
  };
}

// chats: [{ _id, createdAt, messages: [{ role, content, createdAt, solver?, images? }] }]
export function computeProfileStats(chats, { now = new Date(), tzOffset = 0, days = 14 } = {}) {
  const today = dayOf(now, tzOffset);
  const questions = [];
  let answers = 0;
  for (const chat of chats) {
    const msgs = chat.messages ?? [];
    msgs.forEach((m, i) => {
      if (m.role === 'assistant') return void answers++;
      const reply = msgs[i + 1]?.role === 'assistant' ? msgs[i + 1] : null;
      questions.push({ chatId: String(chat._id), text: m.content ?? '', at: new Date(m.createdAt), pictures: m.images?.length ?? 0, reply });
    });
  }
  questions.sort((a, b) => a.at - b.at);

  const mix = { calculation: 0, vedic: 0, ancient: 0, other: 0 };
  const techniques = new Map();
  const langs = new Map();
  for (const q of questions) {
    mix[classify(q.text, q.reply)]++;
    for (const s of q.reply?.solver ?? []) techniques.set(s.method, (techniques.get(s.method) ?? 0) + 1);
    if (q.text.trim()) langs.set(languageOf(q.text), (langs.get(languageOf(q.text)) ?? 0) + 1);
  }

  const activeDays = [...new Set(questions.map((q) => dayOf(q.at, tzOffset)))];
  const perDayMap = new Map();
  for (const q of questions) perDayMap.set(dayOf(q.at, tzOffset), (perDayMap.get(dayOf(q.at, tzOffset)) ?? 0) + 1);
  const perDay = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, questions: perDayMap.get(date) ?? 0 };
  });

  const streak = streaks(activeDays, today);
  const total = questions.length;
  const totals = {
    chats: chats.filter((c) => (c.messages ?? []).length).length,
    questions: total,
    answers,
    calculations: mix.calculation,
    withPictures: questions.filter((q) => q.pictures).length,
    activeDays: activeDays.length,
  };
  const languageGroups = [...langs.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  const badges = [
    { id: 'first', name: 'First step', description: 'Asked your first question', earned: total >= 1 },
    { id: 'curious', name: 'Curious mind', description: 'Asked 10 questions', earned: total >= 10 },
    { id: 'wizard', name: 'Number wizard', description: 'Solved 5 problems with Vedic techniques', earned: mix.calculation >= 5 },
    { id: 'explorer', name: 'Two worlds', description: 'Explored both Vedic maths and ancient science', earned: mix.ancient > 0 && mix.vedic + mix.calculation > 0 },
    { id: 'polyglot', name: 'Polyglot', description: 'Asked in more than one script', earned: languageGroups.length >= 2 },
    { id: 'picture', name: 'Show and tell', description: 'Asked with a picture', earned: totals.withPictures > 0 },
    { id: 'streak', name: 'On a roll', description: 'Learned on 3 days in a row', earned: streak.longest >= 3 },
  ];

  return {
    totals,
    firstQuestionAt: questions[0]?.at ?? null,
    streak,
    level: levelFor(total),
    perDay,
    mix,
    techniques: [...techniques.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    languages: languageGroups,
    recent: questions.slice(-5).reverse().map((q) => ({ chatId: q.chatId, text: q.text.slice(0, 140), at: q.at })),
    badges,
  };
}
