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
        <div class="label">${stage && !(v.chain && stage === 3) ? 'Keep going' : v.chain ? 'Whole passage' : 'Next verse'}</div>
        <div class="ref">${esc(v.title || v.ref)}</div>
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
    if (v.chain && !E.chainReady(v)) stat = `${v.chain.filter(E.isMemorized).length}/${v.chain.length} verses`;
    else if (!c) stat = E.state.path.includes(v.id) ? '' : 'Not in path';
    else if (c.state === 'learning') stat = `Learning ${c.stage}/${E.STAGES.length}`;
    else stat = c.due <= Date.now() ? 'Check due' : `Check ${fmtDue(c.due)}`;
    return `<div class="row${v.chain ? ' chain' : ''}" data-verse="${esc(v.id)}">
      <span class="dot ${s}">${v.chain ? '📖' : ''}</span>
      <div class="rmain"><div class="rref">${esc(v.title ? `${v.title} · ${v.ref}` : v.ref)}</div><div class="rtext">${esc(v.text)}</div></div>
      <span class="rstat">${stat}</span>
    </div>`;
  }
  function packHTML(p, verses, open) {
    const added = p.id === 'custom' || E.state.packsAdded.includes(p.id);
    const done = verses.filter(v => E.isMemorized(v.id)).length;
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
      <div class="rows">
        ${added ? '' : `<button class="btn ghost sm block" data-action="add-pack" data-pack="${p.id}" style="margin-bottom:8px">Add to my path</button>`}
        ${verses.map(v => verseRow(E.verse(v.id))).join('')}
      </div>
    </details>`;
  }
  // Search matches references, verse text (both translations) and topic words like "afraid".
  function searchLibrary(q) {
    const out = $('#lib-results'), body = $('#lib-body');
    q = q.trim().toLowerCase();
    if (!q) { out.innerHTML = ''; body.style.display = ''; return; }
    body.style.display = 'none';
    const terms = q.split(/\s+/).filter(t => t.length > 1 || /\d/.test(t));
    const topics = PACKS.filter(p => terms.some(t => (p.tags + ' ' + p.name).toLowerCase().includes(t)));
    const seen = new Set();
    const hits = Object.values(E.verses).filter(v => {
      const hay = `${v.ref} ${v.title || ''} ${v.kjv || ''} ${v.bsb || ''} ${v.text || ''}`.toLowerCase();
      return terms.length && terms.every(t => hay.includes(t));
    });
    const rows = [...topics.flatMap(p => p.verses), ...hits].filter(v => !seen.has(v.id) && seen.add(v.id));
    out.innerHTML = `
      ${topics.length ? `<h3>Topics</h3>${topics.map(p => packHTML(p, p.verses, true)).join('')}` : ''}
      ${hits.length ? `<h3>Verses</h3><div class="card glass" style="padding:8px 14px">${hits.slice(0, 30).map(v => verseRow(E.verse(v.id))).join('')}</div>` : ''}
      ${rows.length ? '' : `<div class="card glass muted" style="text-align:center">Nothing found for “${esc(q)}”.<br>You can add any verse with the + button.</div>`}`;
  }
  function renderLibrary() {
    const st = E.state;
    const upcoming = st.path.filter(id => E.verse(id) && E.chainReady(E.verse(id)) && (!E.card(id) || E.card(id).state === 'learning')).slice(0, 4);
    const curPack = upcoming[0] && E.verse(upcoming[0]).pack;
    const custom = { id: 'custom', name: 'My Verses', icon: '✍️', desc: 'Verses you’ve added' };
    $('#view-library').innerHTML = `
      <header class="top">
        <div><div class="eyebrow">${plural(E.memorized().length, 'verse')} memorized</div><h1>Library</h1></div>
        <button class="icon-btn" data-action="add-verse" aria-label="Add verse" style="font-size:24px">+</button>
      </header>
      <label class="search glass">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="lib-search" type="search" placeholder="Search: “afraid”, “love”, John 3…" autocomplete="off">
      </label>
      <div id="lib-results"></div>
      <div id="lib-body">
        ${upcoming.length ? `<h3>Up next</h3><div class="card glass" style="padding:8px 14px">${upcoming.map(id => verseRow(E.verse(id))).join('')}</div>` : ''}
        <h3>Collections</h3>
        ${PACKS.filter(p => !p.topic).map(p => packHTML(p, p.verses, p.id === curPack)).join('')}
        ${st.custom.length ? packHTML(custom, st.custom, curPack === 'custom') : ''}
        <h3>By topic</h3>
        ${PACKS.filter(p => p.topic).map(p => packHTML(p, p.verses, false)).join('')}
        <button class="btn ghost block" data-action="add-verse" style="margin-top:6px">✍️ Add your own verse</button>
        <p class="muted small" style="text-align:center;margin-top:18px">New verses use the ${E.TRANSLATIONS[st.settings.tr]} (change in Progress → Settings).<br>Add any other translation with “Add your own verse”.</p>
      </div>
    `;
    $('#lib-search').addEventListener('input', e => searchLibrary(e.target.value));
  }

  // ---------- profile ----------
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function renderProfile() {
    const st = E.state, lvl = E.levelOf(st.xp);
    const floor = E.levelFloor(lvl), ceil = E.levelFloor(lvl + 1);
    const acc = st.stats.attempts ? Math.round(100 * st.stats.firstTry / st.stats.attempts) : 0;
    const refAcc = st.stats.refTotal ? Math.round(100 * st.stats.refRight / st.stats.refTotal) + '%' : '—';

    // 16-week activity grid, columns are weeks (Sun..Sat)
    const today = E.dayStart();
    const start = E.addDays(today, -(7 * 15 + new Date(today).getDay()));
    let cells = '';
    for (let d = start, i = 0; d <= today; d = E.addDays(start, ++i)) {
      const x = st.daily[E.dayKey(d)] || 0;
      const rest = new Date(d).getDay() === st.settings.restDay;
      cells += `<i class="${x >= st.settings.goal ? 'h3' : x >= 30 ? 'h2' : x > 0 ? 'h1' : rest ? 'rest' : ''}" title="${E.dayKey(d)}: ${x} XP"></i>`;
    }
    const sel = (key, opts) => `<select class="select" data-setting="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(st.settings[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

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
        <div class="card glass stat"><div class="n">${refAcc}</div><div class="l">References named</div></div>
        <div class="card glass stat"><div class="n">${Object.values(st.notes).filter(Boolean).length}</div><div class="l">Personal notes</div></div>
      </div>
      <div class="card glass"><h2>Activity</h2><div class="heat">${cells}</div>
        ${st.settings.restDay >= 0 ? `<div class="muted small" style="margin-top:10px">🕊️ ${WEEKDAYS[st.settings.restDay]}s are rest days. Missing one never breaks your streak.</div>` : ''}</div>
      <h3>Badges · ${Object.keys(st.badges).length}/${E.BADGES.length}</h3>
      <div class="badges">${E.BADGES.map(b => `
        <div class="badge ${st.badges[b.id] ? 'got' : ''}"><div class="bi">${b.icon}</div><div class="bn">${esc(b.name)}</div><div class="bd">${esc(b.desc)}</div></div>`).join('')}
      </div>
      <h3>Settings</h3>
      <div class="card glass" style="padding:8px 18px">
        <div class="setting"><span>Daily goal</span>
          <span class="stepper"><button class="icon-btn" data-action="goal" data-d="-25">−</button>${st.settings.goal} XP<button class="icon-btn" data-action="goal" data-d="25">+</button></span></div>
        <div class="setting"><span>Translation<div class="muted small">For verses you start from now on</div></span>${sel('tr', Object.entries(E.TRANSLATIONS).map(([k, n]) => [k, `${k} · ${n.replace(/ (Standard Bible|Version)$/, '')}`]))}</div>
        <div class="setting"><span>Sabbath rest day<div class="muted small">Never breaks your streak</div></span>${sel('restDay', [[-1, 'None'], ...WEEKDAYS.map((d, i) => [i, d])])}</div>
        <div class="setting"><span>Your name<div class="muted small">Shown on challenges you send</div></span><input class="select" data-setting="name" value="${esc(st.settings.name)}" placeholder="Optional" maxlength="24" style="width:130px"></div>
        <div class="setting"><span>Sounds</span><button class="toggle ${st.settings.sound ? 'on' : ''}" data-action="toggle" data-key="sound" aria-label="Sounds"></button></div>
        <div class="setting"><span>Haptics</span><button class="toggle ${st.settings.haptics ? 'on' : ''}" data-action="toggle" data-key="haptics" aria-label="Haptics"></button></div>
        <div class="setting"><span>How it works</span><button class="btn ghost sm" data-action="welcome">View</button></div>
      </div>
      <h3>Daily reminder</h3>
      <div class="card glass" style="padding:8px 18px">
        <div class="setting"><span>Time</span><input class="select" type="time" data-setting="remindAt" value="${esc(st.settings.remindAt)}"></div>
        <p class="muted small" style="margin:0 2px 10px">Adds a repeating daily event with an alert to your phone’s calendar, so the reminder works even when the app is closed.</p>
        <button class="btn primary sm block" data-action="reminder" style="margin-bottom:10px">📅 Add reminder to calendar</button>
      </div>
      <h3>Your data</h3>
      <div class="card glass" style="padding:8px 18px">
        <div class="setting"><span>Move to another device<div class="muted small">Send yourself a link, open it there</div></span><button class="btn ghost sm" data-action="transfer">Share link</button></div>
        <div class="setting"><span>Backup file</span><span style="display:flex;gap:8px"><button class="btn ghost sm" data-action="export">Export</button><button class="btn ghost sm" data-action="import">Import</button></span></div>
        <div class="setting"><span>Start over</span><button class="btn ghost sm danger" data-action="reset-all">Reset</button></div>
      </div>
      <p class="muted small" style="text-align:center;margin-top:18px">Scripture: KJV (public domain) and Berean Standard Bible (BSB), dedicated to the public domain.</p>
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

  const noteField = id => `<label class="field note-field"><span>💭 Why this verse matters to me</span>
    <textarea data-note="${esc(id)}" placeholder="A memory, a prayer, a situation it speaks to… (tying it to your life helps it stick)" maxlength="600">${esc(E.state.notes[id] || '')}</textarea></label>`;

  function verseSheet(id) {
    const v = E.verse(id), c = E.card(id);
    if (!v) return;
    let info = '', actions = '';
    if (v.chain && !E.chainReady(v)) {
      const left = v.chain.filter(x => !E.isMemorized(x)).length;
      info = `<div class="chips"><span class="chip">📖 Passage · ${v.chain.length} verses</span><span class="chip warn">${plural(left, 'verse')} left to learn first</span></div>`;
      actions = `<button class="btn primary" data-action="learn-now" data-id="${esc(id)}">Start this passage</button>`;
    } else if (c && c.state === 'review') {
      const r = E.retrievability(c);
      info = `<div class="chips"><span class="chip ok">Memorized</span><span class="chip">Next check ${fmtDue(c.due)}</span><span class="chip">${plural(c.reps, 'check')}</span>${c.best ? `<span class="chip gold">⏱ Best ${c.best}s</span>` : ''}</div>
        <div class="muted small" style="font-weight:650">Memory strength · ${Math.round(r * 100)}%</div><div class="bar"><i style="width:${r * 100}%"></i></div>`;
      actions = `<button class="btn primary" data-action="practice" data-id="${esc(id)}">Practice now</button>
        <button class="btn ghost" data-action="challenge" data-id="${esc(id)}">🤝 Challenge a friend</button>
        <button class="btn ghost danger" data-action="reset-card" data-id="${esc(id)}">Reset progress</button>`;
    } else {
      info = c ? `<div class="chips"><span class="chip">Learning · step ${c.stage + 1} of ${E.STAGES.length}</span></div>` : '';
      actions = `<button class="btn primary" data-action="learn-now" data-id="${esc(id)}">Learn this now</button>
        <button class="btn ghost" data-action="learn-next" data-id="${esc(id)}">Make it my next verse</button>
        <button class="btn ghost" data-action="challenge" data-id="${esc(id)}">🤝 Invite a friend to learn it</button>`;
    }
    if (v.pack !== 'custom') {
      const other = Object.keys(E.TRANSLATIONS).find(t => t !== v.tr);
      actions += c ? `<button class="btn ghost sm" data-action="switch-tr" data-id="${esc(id)}" data-tr="${other}">Restart in ${other}</button>`
        : `<button class="btn ghost sm" data-action="preview-tr" data-id="${esc(id)}" data-tr="${other}">Show ${other}</button>`;
    }
    if (v.pack === 'custom') actions += `<button class="btn ghost danger" data-action="delete-custom" data-id="${esc(id)}">Delete verse</button>`;
    const ch = E.state.challenges[id];
    openSheet(`
      <div class="eyebrow">${esc(v.title ? v.title + ' · ' : '')}${esc(v.tr)}</div>
      <h1 style="font-family:var(--serif);font-size:30px">${esc(v.ref)}</h1>
      <div class="vtext" id="sheet-vtext">${esc(v.text)}</div>
      ${info}
      ${ch ? `<div class="card glass small" style="margin-top:12px">🤝 <b>${esc(ch.n || 'A friend')}</b> challenged you: ${ch.a}%${ch.s ? ` in ${ch.s}s` : ''}${c && c.best ? ` · you: ${c.bestAcc ?? '—'}% in ${c.best}s` : ''}</div>` : ''}
      ${noteField(id)}
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

  function trPicker() {
    const ex = id => E.verse(id, 'BSB');
    return `<h3 style="margin-left:2px">Choose your translation</h3>
      <div class="tr-pick">${['BSB', 'KJV'].map(t => `
        <button class="card glass tr-opt ${E.state.settings.tr === t ? 'on' : ''}" data-action="pick-tr" data-tr="${t}">
          <b>${t}</b> <span class="muted small">${E.TRANSLATIONS[t]}${t === 'BSB' ? ' · modern English' : ' · classic'}</span>
          <div class="tr-sample">${esc(E.verse('jhn3-16', t).text)}</div>
        </button>`).join('')}</div>
      <p class="muted small" style="margin:0 4px 16px">You can switch any time. Verses you’ve started keep their wording.</p>`;
  }

  function welcomeSheet() {
    openSheet(`
      <div style="text-align:center;font-size:54px;margin-top:6px">🌱</div>
      <h1 style="text-align:center;font-family:var(--serif);font-size:30px;margin-top:8px">Hide His word in your heart</h1>
      <p class="muted" style="text-align:center;font-family:var(--serif);font-style:italic">“I have hidden Your word in my heart that I might not sin against You.” — Psalm 119:11</p>
      <div class="method">
        <div><span class="mi">🧠</span><p><b>Recall, don’t reread</b>Pulling a verse out of memory is what makes it stick, so you’ll actively recall every verse instead of just reading it.</p></div>
        <div><span class="mi">🌗</span><p><b>Clues that fade</b>Each step hides more words, from reading aloud down to no clues at all, until you know the verse by heart.</p></div>
        <div><span class="mi">📈</span><p><b>Checks right before you forget</b>Once learned, a verse comes back tomorrow, then in a few days, then weeks. Each check pushes the next one further out.</p></div>
        <div><span class="mi">🔀</span><p><b>Old and new, woven together</b>Past verses are mixed in between new ones, so nothing you’ve learned slips away.</p></div>
        <div><span class="mi">⌨️</span><p><b>Type first letters, or say it</b>Tap the first letter of each word as you say it in your head, or tap 🎙️ and recite it out loud.</p></div>
      </div>
      ${trPicker()}
      <button class="btn primary block" data-action="welcome-done">Begin</button>`);
  }

  function whatsNewSheet() {
    openSheet(`
      <div style="text-align:center;font-size:50px;margin-top:6px">✨</div>
      <h1 style="text-align:center;font-size:28px;margin-top:6px">What’s new</h1>
      <div class="method">
        <div><span class="mi">📖</span><p><b>Modern translation</b>The Berean Standard Bible is now built in. Verses you already learned keep their KJV wording.</p></div>
        <div><span class="mi">🧭</span><p><b>Where is it?</b>Quick quizzes on references, so you know where each verse lives.</p></div>
        <div><span class="mi">🎙️</span><p><b>Say it out loud</b>Tap the mic during practice and recite the verse instead of typing.</p></div>
        <div><span class="mi">💭</span><p><b>Personal notes</b>Write why a verse matters to you. It makes memories stronger.</p></div>
        <div><span class="mi">📜</span><p><b>Passages & topics</b>Psalm 23, the Lord’s Prayer, the Beatitudes and more, plus verses for anxiety, grief, temptation, love and more. Search by how you feel.</p></div>
        <div><span class="mi">🕊️</span><p><b>Sabbath rest day</b>Sundays never break your streak (change it in settings).</p></div>
        <div><span class="mi">🤝</span><p><b>Challenges</b>Send a friend or your small group a verse and see who knows it best.</p></div>
      </div>
      ${trPicker()}
      <button class="btn primary block" data-action="welcome-done">Got it</button>`);
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
    stopMic();
    const kindLabel = item.kind === 'learn' ? (v.chain ? 'Passage' : 'New verse') : item.kind === 'flash' ? 'Past verse' : item.kind === 'ref' ? 'Reference' : 'Review';
    const body = $('.s-body');
    body.innerHTML = `
      <div class="s-stage"><span>${info.name}</span><span class="kind">· ${kindLabel}</span></div>
      <div class="verse-card glass" id="vcard">
        <div class="vref"><span>${esc(v.title ? `${v.title} · ${v.ref}` : v.ref)}</span><span class="tr">${esc(v.tr)}</span></div>
        <div class="words" id="words"></div>
      </div>
      <div class="s-hint">${info.hint}</div>
      <div class="s-count" id="count"></div>`;
    body.scrollTop = 0;
    if (key === 'read') renderRead(item, v);
    else if (key === 'ref') renderRef(item, v);
    else renderTyping(item, v, key);
  }

  // "Where is it?": pick the reference for a verse you know.
  function renderRef(item, v) {
    $('#vcard .vref span').textContent = 'Which reference?';
    $('#words').textContent = v.text;
    X = { kind: 'ref', item, answer: v.ref, done: false };
    $('.s-bottom').innerHTML = `<div class="ref-opts">${E.refOptions(item.id).map((r, i) =>
      `<button class="btn ghost ref-opt" data-action="ref-pick" data-ref="${esc(r)}"><span class="kbd">${i + 1}</span>${esc(r)}</button>`).join('')}</div>`;
  }
  function pickRef(btn) {
    if (!X || X.kind !== 'ref' || X.done) return;
    X.done = true;
    const ok = btn.dataset.ref === X.answer, st = E.state.stats;
    st.refTotal++;
    $$('.ref-opt').forEach(b => { if (b.dataset.ref === X.answer) b.classList.add('right'); });
    if (ok) { st.refRight++; S.combo++; S.best = Math.max(S.best, S.combo); Fx.sound('pass'); Fx.haptic(10); }
    else { btn.classList.add('wrong'); S.combo = 0; Fx.sound('miss'); Fx.haptic([18, 40, 18]); }
    updateCombo(ok);
    const xp = ok ? 8 : 1;
    gainXP(xp);
    S.badges.push(...E.checkBadges().map(b => (queueToast(`${b.icon} Badge · ${esc(b.name)}`), b)));
    E.save();
    $('#vcard .vref span').textContent = X.answer;
    $('.s-bottom').insertAdjacentHTML('beforeend', `<div class="result glass" style="margin-top:12px;padding:16px">
      <div class="rtitle" style="margin-top:0">${ok ? 'Right! 🧭' : `It’s ${esc(X.answer)}`}</div>
      <button class="btn primary block" data-action="next">Continue <span class="xp">+${xp} XP</span></button></div>`);
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
    const note = E.state.notes[item.id];
    if (note) $('.s-hint').insertAdjacentHTML('afterend', `<div class="card glass note-show">💭 ${esc(note)}</div>`);
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
    X = { kind: 'type', item, key, mode, words, order, pos: 0, wrongs: 0, firstTry: 0, misses: 0, xp: 0, els: $$('.w', box), done: false, t0: 0 };
    const caret = document.createElement('span');
    caret.className = 'caret';
    X.caret = caret;
    $('.s-bottom').innerHTML = `<div class="keyboard glass">
      ${KEYS.map(r => `<div class="krow">${[...r].map(k => `<button class="key" data-key="${k}">${k}</button>`).join('')}</div>`).join('')}
      <div class="krow actions">${SR ? '<button class="key wide mic" data-action="mic">🎙️ Say it</button>' : ''}<button class="key wide" data-action="hint">💡 Show word</button></div>
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
    if (!X.t0) X.t0 = Date.now();
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
    stopMic();
    X.caret.remove();
    const secs = Math.max(1, Math.round((Date.now() - (X.t0 || Date.now())) / 1000));
    $('#count').textContent = '';
    const { item, order, firstTry, misses } = X;
    const total = order.length;
    const acc = total ? firstTry / total : 1;
    const c = E.ensureCard(item.id);
    const st = E.state.stats;
    st.words += firstTry; st.firstTry += firstTry; st.attempts += total;
    st.bestCombo = Math.max(st.bestCombo, S.best);
    S.words += total; S.first += firstTry;
    const ctx = { voice: X.voiced && acc >= 0.8 };
    let xp = X.xp, title, sub, celebrateVerse = false;
    // Personal best (and friend challenges) for full recall from memory.
    if (X.mode === 'recall' && acc >= 0.9 && (!c.best || secs < c.best || acc * 100 > (c.bestAcc || 0))) {
      if (!c.best || secs < c.best) c.best = secs;
      c.bestAcc = Math.max(c.bestAcc || 0, Math.round(acc * 100));
    }
    const ch = E.state.challenges[item.id];
    if (ch && X.mode === 'recall' && acc >= 0.7 && !ch.done) {
      ch.done = true;
      ctx.challenge = true;
      const mine = Math.round(acc * 100), who = esc(ch.n || 'your friend');
      const won = ch.a == null || mine > ch.a || (mine === ch.a && ch.s && secs < ch.s);
      queueToast(ch.a == null ? `🤝 You learned it with ${who}!` : won ? `🏆 You beat ${who}: ${mine}% in ${secs}s` : `🤝 ${who}: ${ch.a}% in ${ch.s}s. You: ${mine}% in ${secs}s`);
    }
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
        body: `<div style="font-weight:700">${esc(v.title ? `${v.title} · ${v.ref}` : v.ref)}</div><div class="cverse">${esc(v.text)}</div>
          <div class="chips" style="justify-content:center"><span class="chip gold">+${xp} XP</span><span class="chip">⏱ ${secs}s</span><span class="chip">First check tomorrow</span></div>
          ${noteField(item.id)}
          <button class="btn ghost block" data-action="challenge" data-id="${esc(item.id)}" style="margin-bottom:10px">🤝 Challenge a friend</button>`,
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

  // ---------- voice: recite the verse out loud ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  const SOUNDS_LIKE = { i: ['eye', 'aye'], to: ['too', 'two'], for: ['four', 'fore'], know: ['no'], knew: ['new'], son: ['sun'], one: ['won'],
    whole: ['hole'], hear: ['here'], there: ['their', 'theyre'], be: ['bee'], our: ['hour', 'are'], thy: ['thigh', 'the'], thee: ['the', 'tea'], ye: ['yeah', 'you'],
    unto: ['onto', 'into'], hath: ['has', 'have'], doth: ['does'], shalt: ['shall'], wilt: ['will'], art: ['are'], lord: ['lords'], wait: ['weight'], peace: ['piece'] };
  const norm = w => String(w).toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'/g, '');
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function wordMatch(said, want) {
    if (!said || !want) return false;
    if (said === want || (SOUNDS_LIKE[want] || []).includes(said)) return true;
    let p = 0; while (p < said.length && said[p] === want[p]) p++;
    if (p >= 5) return true; // believeth / believes, strengtheneth / strengthens
    return lev(said, want) <= (want.length <= 3 ? 0 : want.length <= 6 ? 1 : 2);
  }
  function hearWord(raw) {
    if (!X || X.kind !== 'type' || X.done) return;
    const said = norm(raw), tgt = X.words[X.order[X.pos]];
    if (wordMatch(said, norm(tgt.t))) { X.voiced = true; return press(tgt.key); }
    const nextIdx = X.order[X.pos + 1];
    if (nextIdx != null && wordMatch(said, norm(X.words[nextIdx].t))) {
      // The recognizer dropped a word: accept it, but not as a clean first try.
      X.voiced = true; X.wrongs = 1; press(tgt.key); press(X.words[nextIdx].key);
    }
  }
  function startMic() {
    if (!SR || !X || X.kind !== 'type' || X.done) return;
    try {
      rec = new SR();
      rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
      rec.used = 0;
      rec.onresult = e => {
        const words = []; let final = 0;
        for (let i = 0; i < e.results.length; i++) {
          words.push(...e.results[i][0].transcript.trim().split(/\s+/).filter(Boolean));
          if (e.results[i].isFinal) final = words.length;
        }
        // The last interim word may still change, so wait for it.
        const usable = Math.max(final, words.length - 1);
        while (rec && rec.used < usable) hearWord(words[rec.used++]);
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          toast('🎙️ Microphone isn’t available here'); stopMic();
        }
      };
      rec.onend = () => {
        if (rec && X && X.kind === 'type' && !X.done) { rec.used = 0; try { rec.start(); } catch (_) { stopMic(); } }
      };
      rec.start();
      const b = $('[data-action="mic"]');
      if (b) { b.classList.add('live'); b.textContent = '● Listening'; }
      Fx.haptic(10);
    } catch (err) { toast('🎙️ Microphone isn’t available here'); rec = null; }
  }
  function stopMic() {
    if (!rec) return;
    const r = rec; rec = null;
    try { r.onend = null; r.abort(); } catch (_) {}
    const b = $('[data-action="mic"]');
    if (b) { b.classList.remove('live'); b.textContent = '🎙️ Say it'; }
  }

  function celebrate({ emoji, title, body, btn }) {
    return new Promise(res => {
      const o = document.createElement('div');
      o.className = 'celebrate';
      o.innerHTML = `<div class="panel glass"><div class="emoji">${emoji}</div><div class="ctitle">${title}</div>${body}
        <button class="btn primary block" style="margin-top:8px">${btn}</button></div>`;
      document.body.appendChild(o);
      const done = () => { o.remove(); document.removeEventListener('keydown', onKey, true); res(); };
      const onKey = e => { if (e.target.closest && e.target.closest('textarea')) return; if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(); } };
      o.querySelector('.panel > button:last-child').addEventListener('click', done);
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
    stopMic();
    S = null; X = null;
    $('#session').classList.add('hidden');
    $('#session').innerHTML = '';
    document.body.style.overflow = '';
    render();
  }

  // ---------- links: challenges, transfers, reminders ----------
  const b64e = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = str => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  const bytesToB64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64ToBytes = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  const appURL = () => location.href.split('#')[0];

  async function shareLink(url, text, title) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('🔗 Link copied. Paste it in a message'); }
    catch (e) { prompt('Copy this link:', url); }
  }

  function challenge(id) {
    const v = E.verse(id), c = E.card(id);
    if (!v) return;
    const p = { n: E.state.settings.name || '', tr: v.tr };
    if (v.pack === 'custom') { p.r = v.ref; p.t = v.text; } else p.id = id;
    if (c && c.best) { p.a = c.bestAcc; p.s = c.best; }
    const text = p.a ? `I can recite ${v.ref} from memory, ${p.a}% in ${p.s}s. Can you beat me? 🤝`
      : `Let’s memorize ${v.ref} together 🌱`;
    shareLink(`${appURL()}#c=${b64e(JSON.stringify(p))}`, text, 'Hidden Word challenge');
  }

  let pending = null;
  function challengeSheet(p) {
    let id = p.id && E.verses[p.id] ? p.id : null;
    if (!id && p.r && p.t) id = (E.state.custom.find(v => v.ref === p.r && v.text === p.t) || {}).id || null;
    if (!id && !(p.r && p.t)) return;
    const v = id ? E.verse(id, E.card(id) ? undefined : (E.TRANSLATIONS[p.tr] ? p.tr : undefined)) : { ref: p.r, text: p.t, tr: p.tr || 'Custom' };
    pending = { p, id };
    openSheet(`
      <div style="text-align:center;font-size:50px;margin-top:6px">🤝</div>
      <h1 style="text-align:center;font-size:26px;margin-top:6px">${esc(p.n || 'A friend')} sent you a verse</h1>
      <div class="eyebrow" style="text-align:center;margin-top:14px">${esc(v.ref)} · ${esc(v.tr)}</div>
      <div class="vtext" style="text-align:center">${esc(v.text)}</div>
      <p class="muted" style="text-align:center">${p.a ? `Their score: <b>${p.a}%</b> in <b>${p.s}s</b>. Learn it and see if you can beat it.` : 'Learn it together, then compare how well you each know it.'}</p>
      <div class="actions"><button class="btn primary" data-action="accept-challenge">Accept challenge</button><button class="btn ghost" data-action="close-sheet">Not now</button></div>`);
  }
  function acceptChallenge() {
    if (!pending) return;
    let { p, id } = pending;
    pending = null;
    if (!id) id = E.addCustom(p.r, p.t, p.tr);
    E.state.challenges[id] = { n: p.n, a: p.a ?? null, s: p.s ?? null, at: Date.now() };
    if (!E.card(id) && E.TRANSLATIONS[p.tr]) E.ensureCard(id).tr = p.tr; // same wording as your friend
    E.save();
    if (E.isMemorized(id)) return startSession([{ kind: 'flash', id }]);
    E.learnNext(id);
    startSession(E.buildSession());
  }

  // Move progress between devices with a link (compressed state in the URL fragment, never sent to a server).
  async function transferLink() {
    const json = JSON.stringify(E.state);
    let code;
    if ('CompressionStream' in window) {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      code = 'z' + bytesToB64(new Uint8Array(await new Response(stream).arrayBuffer()));
    } else code = 'j' + b64e(json);
    shareLink(`${appURL()}#t=${code}`, 'My Hidden Word progress. Open this on your other device.', 'Hidden Word transfer');
  }
  async function readTransfer(code) {
    if (code[0] === 'z') {
      const stream = new Blob([b64ToBytes(code.slice(1))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(b64d(code.slice(1)));
  }
  let pendingTransfer = null;
  function transferSheet(obj) {
    pendingTransfer = obj;
    const n = Object.values(obj.cards || {}).filter(c => c.state === 'review').length;
    openSheet(`
      <div style="text-align:center;font-size:50px;margin-top:6px">📲</div>
      <h1 style="text-align:center;font-size:26px;margin-top:6px">Restore progress?</h1>
      <p class="muted" style="text-align:center">This link holds ${plural(n, 'memorized verse')}, ${(obj.xp || 0).toLocaleString()} XP and a ${obj.streak?.count || 0}-day streak.<br>It will <b>replace</b> the progress on this device.</p>
      <div class="actions"><button class="btn primary" data-action="accept-transfer">Restore</button><button class="btn ghost" data-action="close-sheet">Cancel</button></div>`);
  }

  // A repeating calendar event works as a reminder without push servers.
  function downloadReminder() {
    const [h, m] = (E.state.settings.remindAt || '07:30').split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    const f = n => String(n).padStart(2, '0');
    const start = `${d.getFullYear()}${f(d.getMonth() + 1)}${f(d.getDate())}T${f(h)}${f(m)}00`;
    const url = appURL();
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hidden Word//EN', 'BEGIN:VEVENT',
      `UID:hidden-word-${Date.now()}@hidden-word`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${start}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
      'SUMMARY:📖 Hidden Word: hide a verse in your heart', `DESCRIPTION:A few minutes of Scripture memory.\\n${url}`, `URL:${url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for Hidden Word', 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    link.download = 'hidden-word-reminder.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast('📅 Open the file to add it to your calendar', 3500);
  }

  async function handleHash() {
    const h = location.hash;
    if (!h.startsWith('#c=') && !h.startsWith('#t=')) return false;
    history.replaceState(null, '', appURL());
    try {
      if (h.startsWith('#c=')) challengeSheet(JSON.parse(b64d(h.slice(3))));
      else transferSheet(await readTransfer(h.slice(3)));
      return true;
    } catch (e) { toast('That link looks broken'); return false; }
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
      case 'mic': return rec ? stopMic() : startMic();
      case 'ref-pick': return pickRef(a);
      case 'challenge': return challenge(id);
      case 'accept-challenge': return acceptChallenge();
      case 'accept-transfer':
        try { E.importState(pendingTransfer); closeSheet(); render(); toast('Progress restored ✓'); } catch (e) { toast('Couldn’t restore that'); }
        return;
      case 'close-sheet': return closeSheet();
      case 'transfer': return transferLink();
      case 'reminder': return downloadReminder();
      case 'pick-tr':
        E.state.settings.tr = a.dataset.tr; E.save();
        $$('.tr-opt').forEach(b => b.classList.toggle('on', b === a));
        return render();
      case 'preview-tr': {
        const t = $('#sheet-vtext'), showing = a.dataset.tr;
        t.textContent = E.verse(id, showing).text;
        a.dataset.tr = Object.keys(E.TRANSLATIONS).find(x => x !== showing);
        a.textContent = `Show ${a.dataset.tr}`;
        return;
      }
      case 'switch-tr':
        if (confirm(`Restart ${E.verse(id).ref} in the ${E.TRANSLATIONS[a.dataset.tr]}? Progress on this verse resets.`)) { E.switchTranslation(id, a.dataset.tr); verseSheet(id); render(); }
        return;
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
      case 'welcome-done': E.state.onboarded = true; E.state.seen = 2; E.save(); render(); return closeSheet();
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

  // Notes save as you type; settings save on change.
  let noteTimer;
  document.addEventListener('input', e => {
    const id = e.target.dataset && e.target.dataset.note;
    if (!id) return;
    const t = e.target.value.trim();
    if (t) E.state.notes[id] = t; else delete E.state.notes[id];
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { E.checkBadges(); E.save(); }, 400);
  });
  document.addEventListener('change', e => {
    const key = e.target.dataset && e.target.dataset.setting;
    if (!key) return;
    const v = e.target.value;
    E.state.settings[key] = key === 'restDay' ? Number(v) : key === 'name' ? v.trim().slice(0, 24) : v;
    E.save();
    if (key !== 'name' && key !== 'remindAt') render();
  });

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
    if (X && X.kind === 'ref' && !X.done) {
      const b = $$('.ref-opt')[Number(e.key) - 1];
      if (b) { e.preventDefault(); pickRef(b); }
      return;
    }
    if (e.target.closest && e.target.closest('textarea, input')) return;
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
  handleHash().then(shown => {
    if (shown) return;
    if (!E.state.onboarded) setTimeout(welcomeSheet, 400);
    else if (E.state.seen < 2) setTimeout(whatsNewSheet, 400);
  });
  window.addEventListener('hashchange', handleHash);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // exposed for debugging / tests
  window.HW = { startSession, press, missWord, readNext, nextItem, hearWord, wordMatch, challenge, transferLink, readTransfer, get session() { return S; }, get exercise() { return X; } };
})();
