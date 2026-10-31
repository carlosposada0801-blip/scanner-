// Hidden Word — memory engine: storage, spaced repetition, session building, rewards.
(function () {
  const DAY = 86400000;
  const STORE_KEY = 'hiddenword.v1';

  // The learning ladder. Each step removes support (progressive cue fading),
  // so recall gets a little harder each time: a "desirable difficulty".
  const STAGES = ['read', 'gaps1', 'gaps2', 'letters', 'recall'];
  const STAGE_INFO = {
    read:    { name: 'Read it aloud',      hint: 'Read each phrase out loud. Speaking engages more of your memory than silent reading.' },
    gaps1:   { name: 'Fill the gaps',      hint: 'Type the first letter of each missing word.' },
    gaps2:   { name: 'Fewer clues',        hint: 'Most words are hidden now. First letter of each missing word.' },
    letters: { name: 'First letters only', hint: 'Only the first letters remain. Type each one as you say the word.' },
    recall:  { name: 'From memory',        hint: 'No clues. Say the verse in your head and type the first letter of each word.' },
    review:  { name: 'Memory check',       hint: 'Recall the whole verse from its reference.' },
    flash:   { name: 'Flashback',          hint: 'A surprise check on a verse you already know.' },
    relearn: { name: 'Rebuild',            hint: 'Let’s strengthen this one. First letters are shown.' },
  };
  // Minimum first-try accuracy to pass each stage.
  const PASS = { gaps1: 0.8, gaps2: 0.8, letters: 0.85, recall: 0.9 };

  const LEVEL_TITLES = ['Seed', 'Sprout', 'Seedling', 'Rooted', 'Growing', 'Branch', 'Budding', 'Blooming',
    'Fruitful', 'Abiding', 'Steadfast', 'Lamp', 'Watchman', 'Faithful', 'Pillar', 'Elder'];

  const BADGES = [
    { id: 'first',    icon: '🌱', name: 'First Seed',     desc: 'Memorize your first verse' },
    { id: 'v5',       icon: '🌿', name: 'Handful',        desc: 'Memorize 5 verses' },
    { id: 'v10',      icon: '🌳', name: 'Treasury',       desc: 'Memorize 10 verses' },
    { id: 'v25',      icon: '🏛️', name: 'Storehouse',     desc: 'Memorize 25 verses' },
    { id: 'v50',      icon: '📜', name: 'Living Library', desc: 'Memorize 50 verses' },
    { id: 's3',       icon: '🔥', name: 'Kindled',        desc: '3-day streak' },
    { id: 's7',       icon: '🕯️', name: 'Faithful Week',  desc: '7-day streak' },
    { id: 's30',      icon: '☀️', name: 'Abiding',        desc: '30-day streak' },
    { id: 'perfect',  icon: '💎', name: 'Flawless',       desc: 'Perfect memory check' },
    { id: 'combo50',  icon: '⚡', name: 'In the Flow',     desc: '50-word combo' },
    { id: 'comeback', icon: '🪴', name: 'Restored',       desc: 'Rebuild a fading verse' },
    { id: 'goal',     icon: '🎯', name: 'Goal Reached',   desc: 'Hit your daily goal' },
    { id: 'r25',      icon: '🛡️', name: 'Keeper',         desc: 'Complete 25 memory checks' },
    { id: 'w1000',    icon: '✍️', name: 'Thousand Words', desc: 'Recall 1,000 words' },
  ];

  // ---------- time helpers ----------
  const dayStart = (ts = Date.now()) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ts, n) => { const d = new Date(dayStart(ts)); d.setDate(d.getDate() + n); return d.getTime(); };
  const dayKey = (ts = Date.now()) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);

  // ---------- state ----------
  function defaultState() {
    return {
      v: 1,
      cards: {},
      path: PACKS[0].verses.map(v => v.id),
      packsAdded: [PACKS[0].id],
      custom: [],
      xp: 0,
      streak: { count: 0, best: 0, last: null },
      daily: {},
      badges: {},
      stats: { words: 0, firstTry: 0, attempts: 0, reviews: 0, bestCombo: 0, sessions: 0 },
      settings: { goal: 100, sound: true, haptics: true },
      onboarded: false,
      created: Date.now(),
    };
  }

  function load() {
    const d = defaultState();
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1) {
        return { ...d, ...s, settings: { ...d.settings, ...s.settings }, stats: { ...d.stats, ...s.stats }, streak: { ...d.streak, ...s.streak } };
      }
    } catch (e) { /* corrupt or unavailable storage: start fresh */ }
    return d;
  }

  const E = {
    DAY, STAGES, STAGE_INFO, PASS, BADGES, LEVEL_TITLES, dayKey, dayStart, addDays, daysBetween,
    state: load(),
    verses: {},
  };

  E.save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(E.state)); } catch (e) { /* quota */ } };
  E.reset = () => { E.state = defaultState(); E.reindex(); E.save(); };
  E.importState = (obj) => {
    if (!obj || obj.v !== 1 || typeof obj.cards !== 'object') throw new Error('Not a Hidden Word backup');
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
    E.state = load(); E.reindex();
  };

  E.reindex = () => {
    const m = {};
    for (const p of PACKS) for (const v of p.verses) m[v.id] = { ...v, pack: p.id };
    for (const v of E.state.custom) m[v.id] = { ...v, pack: 'custom' };
    E.verses = m;
  };
  E.reindex();
  E.verse = id => E.verses[id];

  E.tokenize = text => text.split(/\s+/).filter(Boolean).map(t => {
    const m = t.match(/[\p{L}\p{N}]/u);
    return { t, key: m ? m[0].toLowerCase() : '' };
  });

  // Deterministic shuffle so a verse's gaps stay consistent between attempts:
  // gaps2 hides a superset of gaps1, so cues fade instead of jumping around.
  function seededOrder(id, n) {
    let h = 2166136261;
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  E.hiddenSet = (id, words, stage) => {
    const typable = words.map((w, i) => (w.key ? i : -1)).filter(i => i >= 0);
    if (stage === 'letters' || stage === 'recall') return new Set(typable);
    const frac = stage === 'gaps1' ? 0.35 : 0.7;
    const order = seededOrder(id, typable.length).map(i => typable[i]);
    return new Set(order.slice(0, Math.max(1, Math.round(typable.length * frac))));
  };

  // ---------- cards & scheduling ----------
  E.card = id => E.state.cards[id];
  E.ensureCard = id => {
    if (!E.state.cards[id]) {
      E.state.cards[id] = { id, state: 'learning', stage: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, last: 0, started: Date.now(), memorized: 0 };
    }
    return E.state.cards[id];
  };

  // Estimated chance you can still recall the verse right now.
  // Decays from 100% to ~90% when it comes due, then keeps falling (forgetting curve).
  E.retrievability = (c, now = Date.now()) => {
    if (!c || c.state !== 'review') return null;
    const elapsed = Math.max(0, (now - c.last) / DAY);
    return Math.pow(0.9, elapsed / Math.max(c.interval, 0.5));
  };
  E.strengthLabel = r => r == null ? 'new' : r >= 0.9 ? 'strong' : r >= 0.75 ? 'good' : r >= 0.5 ? 'fading' : 'faint';

  E.graduate = (c, now = Date.now()) => {
    // First check is tomorrow: sleep consolidates new memories, and testing
    // after a night's sleep is one of the strongest boosts to retention.
    Object.assign(c, { state: 'review', stage: STAGES.length, interval: 1, due: addDays(now, 1), last: now, memorized: c.memorized || now });
  };

  E.gradeFromAccuracy = acc => acc >= 1 ? 4 : acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;

  // SM-2 style expanding intervals. Returns the new interval in days.
  E.schedule = (c, grade, now = Date.now()) => {
    const elapsed = Math.max(0, daysBetween(c.last, now));
    const base = Math.max(c.interval, elapsed, 1);
    let iv;
    if (grade === 1) {
      c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); iv = 1;
    } else {
      if (grade === 2) { c.ease = Math.max(1.3, c.ease - 0.15); iv = base * 1.2; }
      else if (grade === 3) { iv = base * c.ease; }
      else { c.ease = Math.min(3.5, c.ease + 0.15); iv = base * c.ease * 1.3; }
      iv = Math.max(iv, c.interval + 1) * (0.95 + Math.random() * 0.1); // fuzz spreads reviews out
    }
    iv = Math.min(365, Math.max(1, Math.round(iv)));
    Object.assign(c, { interval: iv, due: addDays(now, iv), last: now, reps: c.reps + 1 });
    return iv;
  };

  E.memorized = () => Object.values(E.state.cards).filter(c => c.state === 'review' && E.verses[c.id]);
  E.dueCards = (now = Date.now()) => E.memorized()
    .filter(c => c.due <= now)
    .sort((a, b) => E.retrievability(a, now) - E.retrievability(b, now));

  E.nextNewId = () => {
    for (const id of E.state.path) {
      if (!E.verses[id]) continue;
      const c = E.state.cards[id];
      if (!c || c.state === 'learning') return id;
    }
    // Path finished: roll straight into the next collection.
    const next = PACKS.find(p => !E.state.packsAdded.includes(p.id));
    if (next) { E.addPack(next.id); return E.nextNewId(); }
    return null;
  };

  E.addPack = packId => {
    const p = PACKS.find(x => x.id === packId);
    if (!p) return;
    if (!E.state.packsAdded.includes(packId)) E.state.packsAdded.push(packId);
    for (const v of p.verses) if (!E.state.path.includes(v.id)) E.state.path.push(v.id);
    E.save();
  };
  E.learnNext = id => { E.state.path = [id, ...E.state.path.filter(x => x !== id)]; E.save(); };

  E.addCustom = (ref, text, tr) => {
    const id = 'c' + Date.now().toString(36);
    E.state.custom.push({ id, ref: ref.trim(), text: text.trim().replace(/\s+/g, ' '), tr: (tr || '').trim() || 'Custom' });
    E.reindex();
    E.state.path.push(id);
    E.save();
    return id;
  };
  E.deleteCustom = id => {
    E.state.custom = E.state.custom.filter(v => v.id !== id);
    E.state.path = E.state.path.filter(x => x !== id);
    delete E.state.cards[id];
    E.reindex(); E.save();
  };
  E.resetCard = id => { delete E.state.cards[id]; E.save(); };

  // A memorized verse you haven't seen today, weakest first.
  function flashbackCandidate(now, exclude) {
    const today = dayStart(now);
    return E.memorized()
      .filter(c => c.last < today && c.due > now && !exclude.has(c.id))
      .sort((a, b) => E.retrievability(a, now) - E.retrievability(b, now))[0];
  }

  // Build a short session. Not a calendar: whatever needs attention now.
  //  - due memory checks (weakest first), capped so sessions stay short
  //  - the next new verse's remaining ladder steps, with checks interleaved
  //    between steps (spacing + interleaving beat massed repetition)
  //  - occasionally, a surprise flashback on an older verse
  E.buildSession = (now = Date.now()) => {
    const due = E.dueCards(now);
    const reviews = due.slice(0, 8).map(c => ({ kind: 'review', id: c.id }));
    const newId = due.length <= 10 ? E.nextNewId() : null;
    const items = [];

    if (newId) {
      const c = E.ensureCard(newId);
      const steps = STAGES.slice(c.stage).map(stage => ({ kind: 'learn', id: newId, stage }));
      if (reviews.length) items.push(reviews.shift()); // warm-up
      steps.forEach((s, i) => { items.push(s); if (i < steps.length - 1 && reviews.length) items.push(reviews.shift()); });
      items.push(...reviews);
      if (!due.length && Math.random() < 0.6) {
        const fb = flashbackCandidate(now, new Set([newId]));
        if (fb) items.splice(Math.min(items.length - 1, 2), 0, { kind: 'flash', id: fb.id });
      }
    } else if (reviews.length) {
      items.push(...reviews);
    } else {
      const fb = flashbackCandidate(now, new Set());
      if (fb) items.push({ kind: 'flash', id: fb.id });
    }
    E.save();
    return items;
  };

  // ---------- rewards ----------
  E.levelOf = xp => { let n = 1; while (xp >= 50 * n * (n + 1)) n++; return n; };
  E.levelFloor = n => 50 * (n - 1) * n;
  E.levelTitle = n => LEVEL_TITLES[Math.min(n - 1, LEVEL_TITLES.length - 1)];
  E.todayXP = () => E.state.daily[dayKey()] || 0;

  E.addXP = n => {
    const s = E.state;
    s.xp += n;
    const k = dayKey();
    s.daily[k] = (s.daily[k] || 0) + n;
    if (s.streak.last !== k) {
      const y = dayKey(addDays(Date.now(), -1));
      s.streak.count = s.streak.last === y ? s.streak.count + 1 : 1;
      s.streak.last = k;
      s.streak.best = Math.max(s.streak.best, s.streak.count);
    }
  };
  E.currentStreak = () => {
    const s = E.state.streak;
    return (s.last === dayKey() || s.last === dayKey(addDays(Date.now(), -1))) ? s.count : 0;
  };

  E.award = id => {
    if (E.state.badges[id]) return null;
    E.state.badges[id] = Date.now();
    return BADGES.find(b => b.id === id);
  };
  // Returns newly earned badges.
  E.checkBadges = (ctx = {}) => {
    const s = E.state, m = E.memorized().length, st = E.currentStreak(), out = [];
    const want = [
      [m >= 1, 'first'], [m >= 5, 'v5'], [m >= 10, 'v10'], [m >= 25, 'v25'], [m >= 50, 'v50'],
      [st >= 3, 's3'], [st >= 7, 's7'], [st >= 30, 's30'],
      [ctx.perfect, 'perfect'], [s.stats.bestCombo >= 50, 'combo50'], [ctx.comeback, 'comeback'],
      [E.todayXP() >= s.settings.goal, 'goal'], [s.stats.reviews >= 25, 'r25'], [s.stats.words >= 1000, 'w1000'],
    ];
    for (const [ok, id] of want) if (ok) { const b = E.award(id); if (b) out.push(b); }
    return out;
  };

  window.Engine = E;
})();
