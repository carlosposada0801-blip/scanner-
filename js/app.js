// Hidden Word — UI
(function () {
  const E = Engine;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function fmtDue(ts) {
    const d = E.daysBetween(Date.now(), ts);
    if (d <= 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d < 14) return `in ${d} days`;
    if (d < 60) return `in ${Math.round(d / 7)} weeks`;
    return `in ${Math.round(d / 30)} months`;
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Peace tonight' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function ring(pct, size = 92, stroke = 11) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--gold)"/><stop offset="1" stop-color="var(--accent2)"/></linearGradient></defs>
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="url(#rg)"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
  }
  const snippet = (text, n = 12) => { const w = text.split(' '); return esc(w.slice(0, n).join(' ')) + (w.length > n ? '…' : ''); };
  const statusOf = id => {
    const c = E.card(id);
    if (!c) return 'new';
    if (c.state === 'learning') return 'learning';
    return E.strengthLabel(E.retrievability(c));
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(html, ms = 2600) {
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  const toastQueue = [];
  let toasting = false;
  function queueToast(html) {
    toastQueue.push(html);
    if (toasting) return;
    toasting = true;
    (function next() {
      const h = toastQueue.shift();
      if (!h) { toasting = false; return; }
      toast(h, 2400);
      setTimeout(next, 2700);
    })();
  }

  // ---------- tabs ----------
  let tab = 'home';
  function show(name) {
    tab = name;
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    render();
    scrollTo({ top: 0 });
  }
  function render() {
    if (tab === 'home') renderHome();
    else if (tab === 'library') renderLibrary();
    else renderProfile();
  }

  // ---------- home ----------
  function renderHome() {
    const st = E.state, now = Date.now();
    const due = E.dueCards(now);
    const newId = due.length <= 10 ? E.nextNewId() : null;
    const mem = E.memorized();
    const streak = E.currentStreak();
    const lvl = E.levelOf(st.xp);
    const todayXP = E.todayXP();
    const goal = st.settings.goal;

    let next;
    if (newId) {
      const v = E.verse(newId), c = E.card(newId), stage = c ? c.stage : 0;
      next = `
        <div class="label">${stage ? 'Keep going' : 'Next verse'}</div>
        <div class="ref">${esc(v.ref)}</div>
        <div class="snippet">${snippet(v.text, 14)}</div>
        <div class="ladder">${E.STAGES.map((_, i) => `<i class="${i < stage ? 'on' : ''}"></i>`).join('')}</div>
        <div class="chips">
          ${due.length ? `<span class="chip warn">↻ ${plural(due.length, 'memory check')}</span>` : ''}
          <span class="chip">≈ ${Math.max(2, Math.round(v.text.split(' ').length / 8) + due.length)} min</span>
        </div>
        <button class="btn primary block" data-action="start">${stage || mem.length ? 'Continue' : 'Begin'}</button>`;
    } else if (due.length) {
      next = `
        <div class="label">Memory checks</div>
        <div class="ref">${plural(due.length, 'verse')} ready</div>
        <div class="snippet">${due.length > 10 ? 'Let’s strengthen what you know before adding something new.' : 'These are right at the edge of forgetting — the perfect moment to recall them.'}</div>
        <button class="btn primary block" data-action="start">Strengthen</button>`;
    } else if (mem.length) {
      const soonest = mem.reduce((a, c) => (c.due < a.due ? c : a));
      next = `
        <div class="label">All caught up</div>
        <div class="ref">Well done.</div>
        <div class="snippet">Every verse in your path is hidden in your heart. Next check ${fmtDue(soonest.due)}. Add more from the Library anytime.</div>
        <div class="grid2" style="margin:0">
          <button class="btn ghost" data-action="start">Flashback</button>
          <button class="btn primary" data-tab-go="library">Add verses</button>
        </div>`;
    } else {
      next = `
        <div class="label">Your path is empty</div>
        <div class="ref">Choose a verse</div>
        <div class="snippet">Pick a collection or add your own verse from the Library.</div>
        <button class="btn primary block" data-tab-go="library">Open Library</button>`;
    }

    const strengths = mem.map(c => E.retrievability(c, now));
    const avg = strengths.length ? Math.round(100 * strengths.reduce((a, b) => a + b, 0) / strengths.length) : 0;
    const daily = mem.length ? E.verse(mem[Math.floor(now / E.DAY) % mem.length].id) : null;
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    $('#view-home').innerHTML = `
      <header class="top">
        <div><div class="eyebrow">${esc(date)}</div><h1>${greeting()}</h1></div>
        <div class="pills">
          <span class="pill glass ${streak ? '' : 'dim'}" title="Day streak">🔥 ${streak}</span>
          <span class="pill glass" title="Level">✦ ${lvl}</span>
        </div>
      </header>
      <div class="card glass today">
        ${ring(todayXP / goal)}
        <div>
          <div class="muted small" style="font-weight:650">Today</div>
          <div class="big">${todayXP} <span>/ ${goal} XP</span></div>
          <div class="muted small">${todayXP >= goal ? 'Daily goal reached. Beautiful.' : todayXP ? `${goal - todayXP} XP to your goal` : 'A few minutes is all it takes.'}</div>
        </div>
      </div>
      <div class="card glass next">${next}</div>
      <div class="grid2">
        <div class="card glass stat"><div class="n">${mem.length}</div><div class="l">Verses memorized</div></div>
        <div class="card glass stat"><div class="n">${mem.length ? avg + '%' : '—'}</div><div class="l">Memory strength</div></div>
      </div>
      ${daily ? `
        <h3>Hidden in your heart</h3>
        <div class="card glass heart-verse">${esc(daily.text)}<div class="ref">${esc(daily.ref)} · ${esc(daily.tr)}</div></div>` : ''}
    `;
  }

  // ---------- library ----------
  function verseRow(v) {
    const c = E.card(v.id), s = statusOf(v.id);
    let stat;
    if (!c) stat = E.state.path.includes(v.id) ? '' : 'Not in path';
    else if (c.state === 'learning') stat = `Learning ${c.stage}/${E.STAGES.length}`;
    else stat = c.due <= Date.now() ? 'Check due' : `Check ${fmtDue(c.due)}`;
    return `<div class="row" data-verse="${esc(v.id)}">
      <span class="dot ${s}"></span>
      <div class="rmain"><div class="rref">${esc(v.ref)}</div><div class="rtext">${esc(v.text)}</div></div>
      <span class="rstat">${stat}</span>
    </div>`;
  }
  function renderLibrary() {
    const st = E.state;
    const upcoming = st.path.filter(id => E.verse(id) && (!E.card(id) || E.card(id).state === 'learning')).slice(0, 4);
    const packHTML = (p, verses, extra = '') => {
      const done = verses.filter(v => E.card(v.id) && E.card(v.id).state === 'review').length;
      const open = p.id === E.verse(upcoming[0] || '')?.pack;
      return `<details class="card glass pack" ${open ? 'open' : ''}>
        <summary>
          <div class="pico">${p.icon}</div>
          <div class="pmeta">
            <h2>${esc(p.name)}</h2>
            <div class="pdesc">${done}/${verses.length} memorized · ${esc(p.desc)}</div>
            <div class="bar"><i style="width:${verses.length ? 100 * done / verses.length : 0}%"></i></div>
          </div>
          <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 6l6 6-6 6"/></svg>
        </summary>
        <div class="rows">${extra}${verses.map(verseRow).join('')}</div>
      </details>`;
    };
    const custom = { id: 'custom', name: 'My Verses', icon: '✍️', desc: 'Verses you’ve added' };
    $('#view-library').innerHTML = `
      <header class="top">
        <div><div class="eyebrow">${plural(E.memorized().length, 'verse')} memorized</div><h1>Library</h1></div>
        <button class="icon-btn" data-action="add-verse" aria-label="Add verse" style="font-size:24px">+</button>
      </header>
      ${upcoming.length ? `<h3>Up next</h3><div class="card glass" style="padding:8px 14px">${upcoming.map(id => verseRow(E.verse(id))).join('')}</div>` : ''}
      <h3>Collections</h3>
      ${PACKS.map(p => packHTML(p, p.verses, st.packsAdded.includes(p.id) ? '' :
        `<button class="btn ghost sm block" data-action="add-pack" data-pack="${p.id}" style="margin-bottom:8px">Add to my path</button>`)).join('')}
      ${st.custom.length ? packHTML(custom, st.custom) : ''}
      <button class="btn ghost block" data-action="add-verse" style="margin-top:6px">✍️ Add your own verse</button>
      <p class="muted small" style="text-align:center;margin-top:18px">Collections use the King James Version (public domain).<br>Add any translation you love with “Add your own verse”.</p>
    `;
  }

  // ---------- profile ----------
  function renderProfile() {
    const st = E.state, lvl = E.levelOf(st.xp);
    const floor = E.levelFloor(lvl), ceil = E.levelFloor(lvl + 1);
    const acc = st.stats.attempts ? Math.round(100 * st.stats.firstTry / st.stats.attempts) : 0;

    // 16-week activity grid, columns are weeks (Sun..Sat)
    const today = E.dayStart();
    const start = E.addDays(today, -(7 * 15 + new Date(today).getDay()));
    let cells = '';
    for (let d = start, i = 0; d <= today; d = E.addDays(start, ++i)) {
      const x = st.daily[E.dayKey(d)] || 0;
      cells += `<i class="${x >= st.settings.goal ? 'h3' : x >= 30 ? 'h2' : x > 0 ? 'h1' : ''}" title="${E.dayKey(d)}: ${x} XP"></i>`;
    }

    $('#view-profile').innerHTML = `
      <header class="top"><div><div class="eyebrow">Your journey</div><h1>Progress</h1></div></header>
      <div class="card glass level-card">
        <div class="lvl">
          <div class="level-badge">${lvl}</div>
          <div style="flex:1">
            <h2>${E.levelTitle(lvl)}</h2>
            <div class="muted small">${st.xp.toLocaleString()} XP · ${(ceil - st.xp).toLocaleString()} to level ${lvl + 1}</div>
            <div class="bar"><i style="width:${100 * (st.xp - floor) / (ceil - floor)}%"></i></div>
          </div>
        </div>
      </div>
      <div class="grid2">
        <div class="card glass stat"><div class="n">${E.memorized().length}</div><div class="l">Verses memorized</div></div>
        <div class="card glass stat"><div class="n">🔥 ${E.currentStreak()}</div><div class="l">Day streak · best ${st.streak.best}</div></div>
        <div class="card glass stat"><div class="n">${st.stats.words.toLocaleString()}</div><div class="l">Words recalled</div></div>
        <div class="card glass stat"><div class="n">${st.stats.attempts ? acc + '%' : '—'}</div><div class="l">First-try accuracy</div></div>
      </div>
      <div class="card glass"><h2>Activity</h2><div class="heat">${cells}</div></div>
      <h3>Badges · ${Object.keys(st.badges).length}/${E.BADGES.length}</h3>
      <div class="badges">${E.BADGES.map(b => `
        <div class="badge ${st.badges[b.id] ? 'got' : ''}"><div class="bi">${b.icon}</div><div class="bn">${esc(b.name)}</div><div class="bd">${esc(b.desc)}</div></div>`).join('')}
      </div>
      <h3>Settings</h3>
      <div class="card glass" style="padding:8px 18px">
        <div class="setting"><span>Daily goal</span>
          <span class="stepper"><button class="icon-btn" data-action="goal" data-d="-25">−</button>${st.settings.goal} XP<button class="icon-btn" data-action="goal" data-d="25">+</button></span></div>
        <div class="setting"><span>Sounds</span><button class="toggle ${st.settings.sound ? 'on' : ''}" data-action="toggle" data-key="sound" aria-label="Sounds"></button></div>
        <div class="setting"><span>Haptics</span><button class="toggle ${st.settings.haptics ? 'on' : ''}" data-action="toggle" data-key="haptics" aria-label="Haptics"></button></div>
        <div class="setting"><span>How it works</span><button class="btn ghost sm" data-action="welcome">View</button></div>
        <div class="setting"><span>Backup</span><span style="display:flex;gap:8px"><button class="btn ghost sm" data-action="export">Export</button><button class="btn ghost sm" data-action="import">Import</button></span></div>
        <div class="setting"><span>Start over</span><button class="btn ghost sm danger" data-action="reset-all">Reset</button></div>
      </div>
    `;
  }

  // ---------- sheets ----------
  function openSheet(html) {
    $('#sheet').innerHTML = `<div class="grab"></div>${html}`;
    $('#sheet').scrollTop = 0;
    $('#backdrop').classList.add('show');
    $('#sheet').classList.add('show');
  }
  function closeSheet() {
    $('#backdrop').classList.remove('show');
    $('#sheet').classList.remove('show');
  }

  function verseSheet(id) {
    const v = E.verse(id), c = E.card(id);
    if (!v) return;
    let info = '', actions = '';
    if (c && c.state === 'review') {
      const r = E.retrievability(c);
      info = `<div class="chips"><span class="chip ok">Memorized</span><span class="chip">Next check ${fmtDue(c.due)}</span><span class="chip">${plural(c.reps, 'check')}</span></div>
        <div class="muted small" style="font-weight:650">Memory strength · ${Math.round(r * 100)}%</div><div class="bar"><i style="width:${r * 100}%"></i></div>`;
      actions = `<button class="btn primary" data-action="practice" data-id="${esc(id)}">Practice now</button>
        <button class="btn ghost danger" data-action="reset-card" data-id="${esc(id)}">Reset progress</button>`;
    } else {
      info = c ? `<div class="chips"><span class="chip">Learning · step ${c.stage + 1} of ${E.STAGES.length}</span></div>` : '';
      actions = `<button class="btn primary" data-action="learn-now" data-id="${esc(id)}">Learn this now</button>
        <button class="btn ghost" data-action="learn-next" data-id="${esc(id)}">Make it my next verse</button>`;
    }
    if (v.pack === 'custom') actions += `<button class="btn ghost danger" data-action="delete-custom" data-id="${esc(id)}">Delete verse</button>`;
    openSheet(`
      <div class="eyebrow">${esc(v.tr)}</div>
      <h1 style="font-family:var(--serif);font-size:30px">${esc(v.ref)}</h1>
      <div class="vtext">${esc(v.text)}</div>
      ${info}
      <div class="actions">${actions}</div>`);
  }

  function addVerseSheet() {
    openSheet(`
      <h1 style="font-size:28px">Add a verse</h1>
      <p class="muted">Paste any passage, in any translation.</p>
      <form id="add-form">
        <label class="field"><span>Reference</span><input name="ref" placeholder="e.g. Psalm 23:4" required maxlength="60" autocomplete="off"></label>
        <label class="field"><span>Text</span><textarea name="text" placeholder="Paste the verse text…" required maxlength="1500"></textarea></label>
        <label class="field"><span>Translation</span><input name="tr" placeholder="e.g. NIV, ESV, NLT" maxlength="20" autocomplete="off"></label>
        <label class="setting" style="padding:4px 4px 14px"><span>Learn it next</span><input type="checkbox" name="next" checked style="width:22px;height:22px;accent-color:var(--accent)"></label>
        <button class="btn primary block" type="submit">Add verse</button>
      </form>`);
    $('#add-form').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const text = String(f.get('text')).trim();
      if (E.tokenize(text).filter(w => w.key).length < 2) { toast('That verse looks a little short'); return; }
      const id = E.addCustom(String(f.get('ref')), text, String(f.get('tr')));
      if (f.get('next')) E.learnNext(id);
      closeSheet(); render();
      toast('✍️ Verse added');
    });
  }

  function welcomeSheet() {
    openSheet(`
      <div style="text-align:center;font-size:54px;margin-top:6px">🌱</div>
      <h1 style="text-align:center;font-family:var(--serif);font-size:30px;margin-top:8px">Hide His word in your heart</h1>
      <p class="muted" style="text-align:center;font-family:var(--serif);font-style:italic">“Thy word have I hid in mine heart, that I might not sin against thee.” — Psalm 119:11</p>
      <div class="method">
        <div><span class="mi">🧠</span><p><b>Recall, don’t reread</b>Pulling a verse out of memory is what makes it stick, so you’ll actively recall every verse instead of just reading it.</p></div>
        <div><span class="mi">🌗</span><p><b>Clues that fade</b>Each step hides more words, from reading aloud down to no clues at all, until you know the verse by heart.</p></div>
        <div><span class="mi">📈</span><p><b>Checks right before you forget</b>Once learned, a verse comes back tomorrow, then in a few days, then weeks. Each check pushes the next one further out.</p></div>
        <div><span class="mi">🔀</span><p><b>Old and new, woven together</b>Past verses are mixed in between new ones, so nothing you’ve learned slips away.</p></div>
        <div><span class="mi">⌨️</span><p><b>Type first letters</b>Say each word in your head and tap its first letter. It’s fast, and it shows whether you really know it.</p></div>
      </div>
      <button class="btn primary block" data-action="welcome-done">Begin</button>`);
  }

  // ---------- session ----------
  let S = null;   // session
  let X = null;   // current exercise
  const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  function startSession(items) {
    if (!items || !items.length) { toast('You’re all caught up ✨'); return; }
    closeSheet();
    const lvl = E.levelOf(E.state.xp);
    S = { items, i: 0, xp: 0, words: 0, first: 0, combo: 0, best: 0, memorized: [], badges: [], startLevel: lvl, retries: {} };
    E.state.stats.sessions++;
    const el = $('#session');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="session-inner">
      <div class="s-top">
        <button class="icon-btn" data-action="quit" aria-label="Close">✕</button>
        <div class="s-progress"><i></i></div>
        <div class="combo" id="combo">⚡ 0</div>
      </div>
      <div class="s-body"></div>
      <div class="s-bottom"></div>
    </div>`;
    document.body.style.overflow = 'hidden';
    renderItem();
  }

  function stageKey(item) {
    if (item.kind === 'learn') return item.stage;
    if (item.kind === 'relearn') return item.stage === 'letters' ? 'relearn' : 'recall';
    return item.kind;
  }

  function setProgress() {
    $('.s-progress > i').style.width = (100 * S.i / S.items.length) + '%';
  }
  function updateCombo(bump) {
    const c = $('#combo'); if (!c) return;
    c.textContent = `⚡ ${S.combo}`;
    c.classList.toggle('hot', S.combo >= 10);
    if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 200); }
  }

  function renderItem() {
    X = null;
    if (S.i >= S.items.length) return summary();
    const item = S.items[S.i], v = E.verse(item.id);
    if (!v) { S.i++; return renderItem(); }
    setProgress();
    const key = stageKey(item), info = E.STAGE_INFO[key];
    const kindLabel = item.kind === 'learn' ? 'New verse' : item.kind === 'review' ? 'Review' : item.kind === 'flash' ? 'Past verse' : 'Review';
    const body = $('.s-body');
    body.innerHTML = `
      <div class="s-stage"><span>${info.name}</span><span class="kind">· ${kindLabel}</span></div>
      <div class="verse-card glass" id="vcard">
        <div class="vref"><span>${esc(v.ref)}</span><span class="tr">${esc(v.tr)}</span></div>
        <div class="words" id="words"></div>
      </div>
      <div class="s-hint">${info.hint}</div>
      <div class="s-count" id="count"></div>`;
    body.scrollTop = 0;
    if (key === 'read') renderRead(item, v);
    else renderTyping(item, v, key);
  }

  // Read stage: phrase by phrase, out loud.
  function renderRead(item, v) {
    const words = v.text.split(/\s+/);
    const chunks = [[]];
    words.forEach((w, i) => {
      const cur = chunks[chunks.length - 1];
      cur.push(w);
      if (i < words.length - 1 && (/[,;:.?!]$/.test(w) || cur.length >= 7)) chunks.push([]);
    });
    $('#words').innerHTML = chunks.map((c, i) => `<span class="chunk" data-i="${i}">${esc(c.join(' '))}</span>`).join(' ');
    X = { kind: 'read', item, chunks, at: 0 };
    $('.s-bottom').innerHTML = `
      <div class="krow actions" style="margin:12px 0 0">
        ${'speechSynthesis' in window ? '<button class="btn ghost" data-action="listen" style="flex:none">🔊 Listen</button>' : ''}
        <button class="btn primary" data-action="read-next" style="flex:1">Next phrase</button>
      </div>`;
    paintRead();
  }
  function paintRead() {
    const n = X.chunks.length;
    $$('#words .chunk').forEach((el, i) => {
      el.classList.toggle('now', X.at >= n || i === X.at);
      el.classList.toggle('past', i < X.at);
    });
    $('#count').textContent = X.at < n ? `Phrase ${X.at + 1} of ${n}` : 'Now read the whole verse aloud once more';
    const b = $('[data-action="read-next"]');
    if (b) b.textContent = X.at < n - 1 ? 'Next phrase' : X.at === n - 1 ? 'Whole verse' : 'I’ve read it aloud';
  }
  function readNext() {
    if (!X || X.kind !== 'read') return;
    Fx.sound('tap');
    if (X.at < X.chunks.length) { X.at++; paintRead(); return; }
    const c = E.ensureCard(X.item.id);
    if (c.state === 'learning' && c.stage === 0) c.stage = 1;
    const xp = 5;
    gainXP(xp);
    E.save();
    S.i++;
    renderItem();
  }
  function listen() {
    if (!X || !('speechSynthesis' in window)) return;
    const v = E.verse(X.item.id);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${v.ref}. ${v.text}`);
    u.rate = 0.88;
    speechSynthesis.speak(u);
  }

  // Typing stages: first letter of each word.
  function renderTyping(item, v, key) {
    const words = E.tokenize(v.text);
    const mode = key === 'gaps1' || key === 'gaps2' ? 'gaps' : key === 'letters' || key === 'relearn' ? 'letters' : 'recall';
    const hidden = E.hiddenSet(v.id, words, mode === 'gaps' ? key : mode);
    const order = [...hidden].sort((a, b) => a - b);
    const box = $('#words');
    box.innerHTML = words.map((w, i) => {
      if (!hidden.has(i)) return `<span class="w${mode === 'recall' ? ' gone' : ''}">${esc(w.t)}</span>`;
      const first = (w.t.match(/[\p{L}\p{N}]/u) || [''])[0];
      return `<span class="w ${mode === 'gaps' ? 'blank' : mode === 'letters' ? 'letter' : 'gone'}" data-first="${esc(first)}">${esc(w.t)}</span>`;
    }).join('');
    X = { kind: 'type', item, key, mode, words, order, pos: 0, wrongs: 0, firstTry: 0, misses: 0, xp: 0, els: $$('.w', box), done: false };
    const caret = document.createElement('span');
    caret.className = 'caret';
    X.caret = caret;
    $('.s-bottom').innerHTML = `<div class="keyboard glass">
      ${KEYS.map(r => `<div class="krow">${[...r].map(k => `<button class="key" data-key="${k}">${k}</button>`).join('')}</div>`).join('')}
      <div class="krow actions"><button class="key wide" data-action="hint">💡 Show word</button></div>
    </div>`;
    markCurrent();
  }

  function markCurrent() {
    X.els.forEach(el => el.classList.remove('cur'));
    const idx = X.order[X.pos];
    if (X.mode === 'recall') {
      // reveal any untyped (punctuation-only) words before the target
      for (let i = 0; i < idx; i++) if (X.els[i].classList.contains('gone') && !X.order.includes(i)) X.els[i].classList.remove('gone');
      X.els[idx].before(X.caret);
    } else {
      X.els[idx].classList.add('cur');
    }
    $('#count').textContent = `${X.pos} of ${X.order.length} words`;
  }

  function reveal(idx, cls) {
    const el = X.els[idx];
    el.classList.remove('blank', 'letter', 'gone', 'cur');
    el.classList.add(cls);
  }

  function flashKey(k, cls) {
    const b = $(`.key[data-key="${k}"]`); if (!b) return;
    b.classList.add(cls);
    setTimeout(() => b.classList.remove(cls), 220);
  }

  function press(k) {
    if (!X || X.kind !== 'type' || X.done) return;
    const idx = X.order[X.pos], w = X.words[idx];
    if (k === w.key) {
      const clean = X.wrongs === 0;
      reveal(idx, clean ? 'ok' : 'fixed');
      flashKey(k, 'right');
      if (clean) {
        X.firstTry++;
        S.combo++;
        S.best = Math.max(S.best, S.combo);
        X.xp += 1 + Math.min(4, Math.floor(S.combo / 10));
        if (S.combo % 10 === 0) { floatText($('#combo'), `${S.combo} combo!`); Fx.sound('pass'); }
      }
      Fx.sound('tick', S.combo);
      Fx.haptic(6);
      updateCombo(clean);
      advance();
    } else {
      X.wrongs++;
      S.combo = 0;
      updateCombo();
      flashKey(k, 'wrong');
      Fx.sound('wrong');
      Fx.haptic([18, 40, 18]);
      const card = $('#vcard');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      if (X.wrongs >= 2) missWord();
    }
  }
  function missWord() {
    if (!X || X.kind !== 'type' || X.done) return;
    reveal(X.order[X.pos], 'miss');
    X.misses++;
    S.combo = 0;
    updateCombo();
    Fx.sound('miss');
    advance();
  }
  function advance() {
    X.pos++;
    X.wrongs = 0;
    if (X.pos >= X.order.length) finishTyping();
    else markCurrent();
  }

  function floatText(anchor, text) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'xp-float';
    f.textContent = text;
    f.style.left = (r.left + r.width / 2) + 'px';
    f.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 950);
  }

  function gainXP(n) {
    if (n <= 0) return;
    const before = E.todayXP(), lvlBefore = E.levelOf(E.state.xp);
    E.addXP(n);
    S.xp += n;
    const goal = E.state.settings.goal;
    if (before < goal && E.todayXP() >= goal) {
      queueToast('🎯 Daily goal reached!');
      Fx.confetti(70, { x: innerWidth / 2, y: 60 });
    }
    const lvl = E.levelOf(E.state.xp);
    if (lvl > lvlBefore) queueToast(`✦ Level ${lvl} · ${E.levelTitle(lvl)}`);
  }

  // Insert an item `gap` positions ahead, so there's spacing before the retry.
  function insertLater(item, gap = 2) {
    S.items.splice(Math.min(S.items.length, S.i + gap), 0, item);
  }

  const PRAISE = ['Well done!', 'Beautiful.', 'Wonderful.', 'Excellent!', 'Hidden in your heart.', 'Nicely done.', 'Faithful work.'];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  async function finishTyping() {
    X.done = true;
    X.caret.remove();
    $('#count').textContent = '';
    const { item, order, firstTry, misses } = X;
    const total = order.length;
    const acc = total ? firstTry / total : 1;
    const c = E.ensureCard(item.id);
    const st = E.state.stats;
    st.words += firstTry; st.firstTry += firstTry; st.attempts += total;
    st.bestCombo = Math.max(st.bestCombo, S.best);
    S.words += total; S.first += firstTry;
    const ctx = {};
    let xp = X.xp, title, sub, celebrateVerse = false;
    const slips = total - firstTry;
    const slipText = slips ? `${plural(slips, 'slip')}` : 'no slips';

    if (item.kind === 'learn') {
      const si = E.STAGES.indexOf(item.stage);
      if (acc >= E.PASS[item.stage]) {
        xp += 10;
        if (c.state === 'learning') c.stage = Math.max(c.stage, si + 1);
        if (item.stage === 'recall' && c.state === 'learning') {
          E.graduate(c);
          xp += 50;
          celebrateVerse = true;
          S.memorized.push(item.id);
        }
        title = pick(PRAISE);
        sub = item.stage === 'recall' ? 'You recalled it with no clues.' : `${Math.round(acc * 100)}% · ${slipText}. Clues fade next.`;
      } else {
        // Fail: retry this step a little later, after something else (spacing).
        S.items = S.items.filter((x, i) => i <= S.i || !(x.kind === 'learn' && x.id === item.id));
        const n = (S.retries[item.id] = (S.retries[item.id] || 0) + 1);
        if (n <= 2) {
          E.STAGES.slice(si).forEach((stage, k) => insertLater({ kind: 'learn', id: item.id, stage }, 2 + k));
          title = 'Almost there';
          sub = `${Math.round(acc * 100)}% · we’ll try this step again in a moment.`;
        } else {
          title = 'Good effort';
          sub = 'We’ll pick this step back up next time. Rest helps memory.';
        }
        xp += 3;
      }
    } else if (item.kind === 'review' || (item.kind === 'flash' && acc < 0.7)) {
      const grade = E.gradeFromAccuracy(acc);
      const iv = E.schedule(c, grade);
      st.reviews++;
      if (grade === 1) {
        insertLater({ kind: 'relearn', id: item.id, stage: 'letters' }, 2);
        insertLater({ kind: 'relearn', id: item.id, stage: 'recall' }, 4);
        title = 'Let’s rebuild this one';
        sub = 'A little practice now and it’ll come back stronger.';
        xp += 3;
      } else {
        if (acc === 1) ctx.perfect = true;
        xp += 10 + (acc === 1 ? 10 : 0);
        title = acc === 1 ? 'Flawless!' : pick(PRAISE);
        sub = `${Math.round(acc * 100)}% · next check ${fmtDue(c.due)} (${plural(iv, 'day')})`;
      }
    } else if (item.kind === 'flash') {
      xp += 10;
      if (acc === 1) ctx.perfect = true;
      title = acc === 1 ? 'Still flawless!' : 'Still there!';
      sub = `${Math.round(acc * 100)}% · this verse is holding strong.`;
    } else { // relearn
      xp += 5;
      if (item.stage === 'recall' && acc >= 0.85) { ctx.comeback = true; title = 'Restored!'; sub = 'Back in your heart. We’ll check again tomorrow.'; }
      else { title = item.stage === 'letters' ? 'Good' : 'Getting there'; sub = item.stage === 'letters' ? 'Next, from memory.' : 'We’ll keep strengthening it tomorrow.'; }
    }

    gainXP(xp);
    S.badges.push(...E.checkBadges(ctx).map(b => (queueToast(`${b.icon} Badge · ${esc(b.name)}`), b)));
    E.save();

    const stars = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1;
    if (acc >= 0.8) Fx.sound('pass');

    if (celebrateVerse) {
      const v = E.verse(item.id);
      Fx.sound('fanfare');
      Fx.haptic([30, 60, 30, 60, 80]);
      Fx.confetti(180);
      await celebrate({
        emoji: '🌟',
        title: `<span class="glow-text">Memorized!</span>`,
        body: `<div style="font-weight:700">${esc(v.ref)}</div><div class="cverse">${esc(v.text)}</div>
          <div class="chips" style="justify-content:center"><span class="chip gold">+${xp} XP</span><span class="chip">First check tomorrow</span></div>`,
        btn: 'Continue',
      });
      S.i++;
      return renderItem();
    }

    $('.s-bottom').innerHTML = `<div class="result glass">
      <div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="rtitle">${title}</div>
      <div class="rsub">${sub}</div>
      <button class="btn primary block" data-action="next">Continue <span class="xp">+${xp} XP</span></button>
    </div>`;
  }

  function celebrate({ emoji, title, body, btn }) {
    return new Promise(res => {
      const o = document.createElement('div');
      o.className = 'celebrate';
      o.innerHTML = `<div class="panel glass"><div class="emoji">${emoji}</div><div class="ctitle">${title}</div>${body}
        <button class="btn primary block" style="margin-top:8px">${btn}</button></div>`;
      document.body.appendChild(o);
      const done = () => { o.remove(); document.removeEventListener('keydown', onKey, true); res(); };
      const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); done(); } };
      o.querySelector('button').addEventListener('click', done);
      document.addEventListener('keydown', onKey, true);
    });
  }

  function nextItem() { if (!S) return; S.i++; renderItem(); }

  function summary() {
    X = null;
    setProgress();
    const acc = S.words ? Math.round(100 * S.first / S.words) : 100;
    const lvl = E.levelOf(E.state.xp), floor = E.levelFloor(lvl), ceil = E.levelFloor(lvl + 1);
    const streak = E.currentStreak();
    const more = E.dueCards().length || E.nextNewId();
    Fx.sound('fanfare');
    if (S.memorized.length || lvl > S.startLevel) Fx.confetti(120);
    $('.s-body').innerHTML = `<div class="summary">
      <div class="emoji">${S.memorized.length ? '🌟' : lvl > S.startLevel ? '✦' : '🙌'}</div>
      <h1>${S.memorized.length ? 'Verse memorized' : 'Session complete'}</h1>
      <p class="muted">${S.memorized.length ? esc(S.memorized.map(id => E.verse(id).ref).join(', ')) + ' is now hidden in your heart.' : 'Every recall makes the memory stronger.'}</p>
      <div class="grid3">
        <div class="card glass"><div class="n" style="color:var(--gold)">+${S.xp}</div><div class="l">XP</div></div>
        <div class="card glass"><div class="n">${acc}%</div><div class="l">Accuracy</div></div>
        <div class="card glass"><div class="n">⚡ ${S.best}</div><div class="l">Best combo</div></div>
      </div>
      <div class="card glass" style="text-align:left">
        <div style="display:flex;justify-content:space-between;font-weight:700"><span>Level ${lvl} · ${E.levelTitle(lvl)}</span><span>🔥 ${plural(streak, 'day')}</span></div>
        <div class="bar"><i style="width:${100 * (E.state.xp - floor) / (ceil - floor)}%"></i></div>
        <div class="muted small" style="margin-top:6px">${(ceil - E.state.xp).toLocaleString()} XP to level ${lvl + 1}</div>
      </div>
      ${S.badges.map((b, i) => `<div class="card glass new-badge" style="animation-delay:${0.2 + i * 0.12}s"><span class="bi">${b.icon}</span><div><b>${esc(b.name)}</b><div class="muted small">${esc(b.desc)}</div></div></div>`).join('')}
    </div>`;
    $('.s-bottom').innerHTML = `<div class="krow actions" style="margin:12px 0 0">
      <button class="btn ghost" data-action="quit" style="flex:1">Done</button>
      ${more ? '<button class="btn primary" data-action="again" style="flex:1.4">Keep going</button>' : ''}
    </div>`;
    S.done = true;
  }

  function closeSession() {
    if (S && !S.done && S.i > 0) { summary(); return; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    S = null; X = null;
    $('#session').classList.add('hidden');
    $('#session').innerHTML = '';
    document.body.style.overflow = '';
    render();
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { Fx.sound('tap'); return show(tabBtn.dataset.tab); }
    const go = e.target.closest('[data-tab-go]');
    if (go) return show(go.dataset.tabGo);
    const key = e.target.closest('.key[data-key]');
    if (key) return press(key.dataset.key);
    const row = e.target.closest('[data-verse]');
    if (row) return verseSheet(row.dataset.verse);
    if (e.target.closest('#vcard') && X && X.kind === 'read') return readNext();

    const a = e.target.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    switch (a.dataset.action) {
      case 'start': return startSession(E.buildSession());
      case 'again': S = null; return startSession(E.buildSession());
      case 'quit': return closeSession();
      case 'next': return nextItem();
      case 'hint': return missWord();
      case 'read-next': return readNext();
      case 'listen': return listen();
      case 'add-verse': return addVerseSheet();
      case 'add-pack': E.addPack(a.dataset.pack); toast('Added to your path'); return render();
      case 'learn-next': E.learnNext(id); closeSheet(); render(); return toast('Up next ✓');
      case 'learn-now': E.learnNext(id); return startSession(E.buildSession());
      case 'practice': return startSession([{ kind: 'flash', id }]);
      case 'reset-card':
        if (confirm('Reset progress for this verse?')) { E.resetCard(id); closeSheet(); render(); }
        return;
      case 'delete-custom':
        if (confirm('Delete this verse?')) { E.deleteCustom(id); closeSheet(); render(); }
        return;
      case 'goal':
        E.state.settings.goal = Math.min(500, Math.max(25, E.state.settings.goal + Number(a.dataset.d)));
        E.save(); return render();
      case 'toggle':
        E.state.settings[a.dataset.key] = !E.state.settings[a.dataset.key];
        E.save(); return render();
      case 'welcome': return welcomeSheet();
      case 'welcome-done': E.state.onboarded = true; E.save(); return closeSheet();
      case 'export': {
        const blob = new Blob([JSON.stringify(E.state, null, 1)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `hidden-word-backup-${E.dayKey()}.json`;
        link.click();
        return setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      case 'import': return $('#import-file').click();
      case 'reset-all':
        if (confirm('Erase all progress and start over? This cannot be undone.')) { E.reset(); render(); toast('Fresh start 🌱'); }
        return;
    }
  });

  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { E.importState(JSON.parse(await f.text())); render(); toast('Backup restored ✓'); }
    catch (err) { toast('Couldn’t read that backup'); }
    e.target.value = '';
  });

  $('#backdrop').addEventListener('click', closeSheet);

  // swipe sheet down to close
  let sy = null;
  $('#sheet').addEventListener('touchstart', e => { sy = $('#sheet').scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  $('#sheet').addEventListener('touchend', e => { if (sy != null && e.changedTouches[0].clientY - sy > 90) closeSheet(); sy = null; });

  document.addEventListener('keydown', e => {
    if (!S) { if (e.key === 'Escape') closeSheet(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); return closeSession(); }
    const enter = e.key === 'Enter' || e.key === ' ';
    if (X && X.kind === 'read') {
      if (enter || e.key === 'ArrowRight') { e.preventDefault(); readNext(); }
      return;
    }
    if (X && X.kind === 'type' && !X.done) {
      if (/^[\p{L}\p{N}]$/u.test(e.key)) { e.preventDefault(); press(e.key.toLowerCase()); }
      else if (e.key === '?') { e.preventDefault(); missWord(); }
      return;
    }
    if (enter) {
      const b = $('#session [data-action="next"]') || $('#session [data-action="again"]') || $('#session [data-action="quit"]');
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !S) render(); });

  // ---------- boot ----------
  render();
  if (!E.state.onboarded) setTimeout(welcomeSheet, 400);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // exposed for debugging / tests
  window.HW = { startSession, press, missWord, readNext, nextItem, get session() { return S; }, get exercise() { return X; } };
})();
