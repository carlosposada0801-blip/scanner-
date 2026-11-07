// ---------- state ----------
const KEY = "bookmarkClub.v1";
const fresh = () => ({
  name: "", buddy: null, tokens: 0, totalEarned: 0,
  read: {},          // storyId -> { best: correctCount, times: n, wpm }
  owned: [],         // catalog ids
  placed: [],        // catalog ids shown in clubhouse
  theme: null,       // wallpaper id
  lastBonus: null,   // yyyy-mm-dd
  gamesWon: 0,
});
let S = load();
function load() {
  try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return fresh(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} renderWallet(); }

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const screen = $("#screen");
const buddy = () => BUDDIES.find(b => b.id === S.buddy) || BUDDIES[0];
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function buddyArt(b = buddy(), size = 1) {
  return `<div class="buddy" style="--c:${b.color};--s:${size}">
    <div class="buddy-tab"></div>
    <div class="buddy-body"><span class="buddy-face">${b.face}</span></div>
    <div class="buddy-tassel"></div>
  </div>`;
}

function earn(n, why) {
  S.tokens += n; S.totalEarned += n; save();
  toast(`+${n} ★ ${why}`);
  const w = $("#wallet"); w.classList.remove("bump"); void w.offsetWidth; w.classList.add("bump");
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function renderWallet() {
  $("#tokenCount").textContent = S.tokens;
  $("#buddyFoot").textContent = S.name ? `${buddy().face} ${S.name}` : "";
}

// ---------- router ----------
const routes = { home, library, read: readStory, games, scramble, match, catalog, clubhouse };
function go(name, arg) {
  stopSpeech();
  if (!S.name) return signup();
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.go === name || (name === "read" && b.dataset.go === "library") || ((name === "scramble" || name === "match") && b.dataset.go === "games")));
  (routes[name] || home)(arg);
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g) go(g.dataset.go, g.dataset.arg);
});

// ---------- sign up ----------
function signup() {
  let pick = BUDDIES[0].id;
  screen.innerHTML = `
    <section class="panel center">
      <h1 class="big">Welcome to Bookmark Club!</h1>
      <p class="lead">Read stories, earn <b class="gold">★ tokens</b>, and spend them in the Catalog to build your very own Clubhouse.</p>
      <h2>Step 1: Pick your Bookmark Buddy</h2>
      <div class="buddy-pick">${BUDDIES.map(b => `
        <button class="pick ${b.id === pick ? "on" : ""}" data-b="${b.id}">
          ${buddyArt(b, .8)}<b>${b.name}</b><small>${b.bio}</small>
        </button>`).join("")}
      </div>
      <h2>Step 2: Type your reader name</h2>
      <input id="nameIn" maxlength="16" placeholder="Your first name" autocomplete="off">
      <div><button id="joinBtn" class="btn big-btn">Join the Club! ➜</button></div>
    </section>`;
  screen.querySelectorAll(".pick").forEach(p => p.onclick = () => {
    pick = p.dataset.b;
    screen.querySelectorAll(".pick").forEach(x => x.classList.toggle("on", x === p));
  });
  $("#joinBtn").onclick = () => {
    const n = $("#nameIn").value.trim();
    if (!n) { $("#nameIn").focus(); toast("Type your name first!"); return; }
    S.name = n; S.buddy = pick; S.tokens = 20; S.totalEarned = 20; save();
    toast("Welcome gift: +20 ★");
    go("home");
  };
}

// ---------- home ----------
function home() {
  const b = buddy();
  const storiesDone = Object.keys(S.read).length;
  const bonusReady = S.lastBonus !== today();
  const next = STORIES.find(s => !S.read[s.id]) || STORIES[0];
  screen.innerHTML = `
    <section class="home-grid">
      <div class="panel hello">
        ${buddyArt(b, 1.3)}
        <div class="bubble">Hi <b>${esc(S.name)}</b>! I'm ${b.name}. Ready to read something awesome today?</div>
      </div>
      <div class="panel stats">
        <h2>My Reading Report</h2>
        <div class="stat"><span>📖</span><b>${storiesDone}</b> of ${STORIES.length} stories read</div>
        <div class="stat"><span>★</span><b>${S.totalEarned}</b> tokens earned all-time</div>
        <div class="stat"><span>🛍️</span><b>${S.owned.length}</b> catalog prizes</div>
        <div class="stat"><span>🧩</span><b>${S.gamesWon}</b> word games won</div>
        <div class="bar"><div style="width:${storiesDone / STORIES.length * 100}%"></div></div>
      </div>
      <div class="panel bonus ${bonusReady ? "" : "used"}">
        <h2>🎁 Daily Bonus</h2>
        ${bonusReady ? `<p>Your daily gift is waiting!</p><button id="bonusBtn" class="btn gold-btn">Open it!</button>`
                     : `<p>You already got today's gift. Come back tomorrow!</p>`}
      </div>
      <div class="panel next">
        <h2>Up Next</h2>
        <div class="story-mini" data-go="read" data-arg="${next.id}">
          <span class="icon">${next.icon}</span>
          <div><b>${next.title}</b><small>${LEVELS[next.level - 1].name}</small></div>
          <span class="btn">Read ➜</span>
        </div>
      </div>
    </section>`;
  const bb = $("#bonusBtn");
  if (bb) bb.onclick = () => { S.lastBonus = today(); earn(10, "Daily bonus!"); home(); };
}

// ---------- library ----------
let currentLevel = 1;
function library(level) {
  if (level) currentLevel = +level;
  screen.innerHTML = `
    <section class="panel">
      <h1>📚 The Reading Room</h1>
      <p>Read a story, then answer the questions. Each right answer earns tokens!</p>
      <div class="tabs">${LEVELS.map(l => `
        <button class="tab ${l.id === currentLevel ? "on" : ""}" style="--c:${l.color}" data-go="library" data-arg="${l.id}">${l.name}</button>`).join("")}
      </div>
      <div class="story-grid">${STORIES.filter(s => s.level === currentLevel).map(s => {
        const r = S.read[s.id];
        return `<div class="story-card" data-go="read" data-arg="${s.id}" style="--c:${LEVELS[s.level - 1].color}">
          <div class="cover">${s.icon}</div>
          <b>${s.title}</b>
          ${r ? `<span class="done">✔ ${r.best}/${s.questions.length} · ${r.wpm} wpm</span>` : `<span class="new">NEW!</span>`}
        </div>`;
      }).join("")}</div>
    </section>`;
}

// ---------- reading ----------
let speaking = false;
function stopSpeech() { if (window.speechSynthesis) speechSynthesis.cancel(); speaking = false; }

function readStory(id) {
  const s = STORIES.find(x => x.id === id) || STORIES[0];
  const words = s.text.split(/\s+/);
  let start = null;
  screen.innerHTML = `
    <section class="panel reader">
      <button class="link" data-go="library" data-arg="${s.level}">← Back to Reading Room</button>
      <h1>${s.icon} ${s.title}</h1>
      <div class="reader-tools">
        <button id="startBtn" class="btn">▶ Start Reading</button>
        ${window.speechSynthesis ? `<button id="ttsBtn" class="btn ghost">🔊 Read it to me</button>` : ""}
        <span id="timer" class="timer">0:00</span>
      </div>
      <div id="passage" class="passage blur">${words.map((w, i) => `<span data-i="${i}">${esc(w)}</span>`).join(" ")}</div>
      <div class="reader-foot"><button id="doneBtn" class="btn gold-btn" disabled>I'm Done Reading! ✔</button></div>
      <div id="quiz"></div>
    </section>`;

  let tick;
  $("#startBtn").onclick = () => {
    start = Date.now();
    $("#passage").classList.remove("blur");
    $("#startBtn").disabled = true; $("#doneBtn").disabled = false;
    tick = setInterval(() => {
      const sec = (Date.now() - start) / 1000 | 0;
      $("#timer").textContent = `${sec / 60 | 0}:${String(sec % 60).padStart(2, "0")}`;
    }, 250);
  };
  // click a word to hear it
  $("#passage").onclick = e => {
    const w = e.target.closest("span[data-i]");
    if (w && window.speechSynthesis && !speaking) say(w.textContent.replace(/[^\w'-]/g, ""));
  };
  const tts = $("#ttsBtn");
  if (tts) tts.onclick = () => {
    if (speaking) { stopSpeech(); tts.textContent = "🔊 Read it to me"; return; }
    if (!start) $("#startBtn").click();
    const spans = [...$("#passage").children];
    const u = new SpeechSynthesisUtterance(s.text);
    u.rate = .9;
    let charPos = 0; const offsets = words.map(w => { const o = s.text.indexOf(w, charPos); charPos = o + w.length; return o; });
    u.onboundary = e => {
      const i = offsets.findLastIndex(o => o <= e.charIndex);
      spans.forEach((sp, k) => sp.classList.toggle("hl", k === i));
    };
    u.onend = () => { speaking = false; spans.forEach(sp => sp.classList.remove("hl")); if (tts.isConnected) tts.textContent = "🔊 Read it to me"; };
    speaking = true; tts.textContent = "⏹ Stop"; speechSynthesis.speak(u);
  };
  $("#doneBtn").onclick = () => {
    clearInterval(tick); stopSpeech();
    const mins = Math.max((Date.now() - start) / 60000, 0.1);
    const wpm = Math.round(words.length / mins);
    $("#doneBtn").disabled = true;
    quiz(s, wpm);
  };
}

function say(text) {
  const u = new SpeechSynthesisUtterance(text); u.rate = .85; speechSynthesis.speak(u);
}

function quiz(s, wpm) {
  const firstTime = !S.read[s.id];
  const answers = [];
  const q = $("#quiz");
  q.innerHTML = `
    <div class="wpm">⏱️ You read <b>${wpm}</b> words per minute!</div>
    <h2>Quiz Time!</h2>
    ${s.questions.map((qq, i) => `
      <div class="question" data-q="${i}">
        <p><b>${i + 1}.</b> ${qq.q}</p>
        <div class="choices">${qq.a.map((a, j) => `<button class="choice" data-j="${j}">${a}</button>`).join("")}</div>
      </div>`).join("")}
    <div id="result"></div>`;
  q.scrollIntoView({ behavior: "smooth" });

  q.querySelectorAll(".question").forEach(el => {
    const i = +el.dataset.q;
    el.querySelectorAll(".choice").forEach(btn => btn.onclick = () => {
      if (answers[i] !== undefined) return;
      const j = +btn.dataset.j, ok = j === s.questions[i].c;
      answers[i] = ok;
      btn.classList.add(ok ? "right" : "wrong");
      if (!ok) el.querySelector(`[data-j="${s.questions[i].c}"]`).classList.add("right");
      el.classList.add("answered");
      if (answers.filter(a => a !== undefined).length === s.questions.length) finish();
    });
  });

  function finish() {
    const correct = answers.filter(Boolean).length;
    const per = firstTime ? 5 : 2;
    let total = (firstTime ? 5 : 2) + correct * per;
    const perfect = correct === s.questions.length;
    if (perfect && firstTime) total += 10;
    const prev = S.read[s.id];
    S.read[s.id] = { best: Math.max(correct, prev?.best || 0), times: (prev?.times || 0) + 1, wpm: Math.max(wpm, prev?.wpm || 0) };
    earn(total, perfect ? "Perfect score!" : "Nice reading!");
    const nextStory = STORIES[STORIES.indexOf(s) + 1];
    $("#result").innerHTML = `
      <div class="result ${perfect ? "perfect" : ""}">
        ${buddyArt(buddy(), .7)}
        <div>
          <h2>${perfect ? "WOW! Perfect score!" : correct ? "Great job!" : "Good try!"}</h2>
          <p>You got <b>${correct} of ${s.questions.length}</b> right and earned <b class="gold">${total} ★</b>${perfect && firstTime ? " (including a +10 perfect bonus!)" : ""}.</p>
          ${!firstTime ? `<p><small>Re-reading earns fewer tokens. Try a new story for the big rewards!</small></p>` : ""}
          <div class="row">
            ${nextStory ? `<button class="btn" data-go="read" data-arg="${nextStory.id}">Next Story ➜</button>` : ""}
            <button class="btn ghost" data-go="catalog">Go Shopping 🛍️</button>
          </div>
        </div>
      </div>`;
    $("#result").scrollIntoView({ behavior: "smooth" });
  }
}

// ---------- games ----------
function games() {
  screen.innerHTML = `
    <section class="panel">
      <h1>🧩 Word Games</h1>
      <p>Warm up your word power and earn bonus tokens!</p>
      <div class="game-grid">
        <div class="game-card" data-go="scramble" style="--c:#ff6b6b">
          <div class="cover">🔤</div><b>Word Scramble</b><small>Unscramble the reading words. +3 ★ each</small>
        </div>
        <div class="game-card" data-go="match" style="--c:#5aa9ff">
          <div class="cover">🔗</div><b>Synonym Match</b><small>Match words that mean the same thing. +8 ★ per board</small>
        </div>
      </div>
    </section>`;
}

function scramble() {
  const item = SCRAMBLE_WORDS[Math.random() * SCRAMBLE_WORDS.length | 0];
  let letters = shuffle(item.w.split(""));
  if (letters.join("") === item.w) letters.reverse();
  let built = [];
  const draw = () => {
    screen.innerHTML = `
      <section class="panel center">
        <button class="link" data-go="games">← Back to Word Games</button>
        <h1>🔤 Word Scramble</h1>
        <p class="hint">Hint: ${item.hint}</p>
        <div class="slots">${item.w.split("").map((_, i) => `<span class="slot">${built[i] ? built[i].ch : ""}</span>`).join("")}</div>
        <div class="tiles">${letters.map((ch, i) => `<button class="tile" data-i="${i}" ${built.some(b => b.i === i) ? "disabled" : ""}>${ch}</button>`).join("")}</div>
        <div class="row"><button id="undo" class="btn ghost">↶ Undo</button><button id="skip" class="btn ghost">New word</button></div>
      </section>`;
    screen.querySelectorAll(".tile").forEach(t => t.onclick = () => {
      built.push({ i: +t.dataset.i, ch: letters[+t.dataset.i] });
      if (built.length === item.w.length) {
        const guess = built.map(b => b.ch).join("");
        if (guess === item.w) { S.gamesWon++; earn(3, `You spelled ${item.w}!`); draw(); $(".slots").classList.add("win"); setTimeout(scramble, 1200); return; }
        toast("Not quite — try again!"); built = [];
      }
      draw();
    });
    $("#undo").onclick = () => { built.pop(); draw(); };
    $("#skip").onclick = scramble;
  };
  draw();
}

function match() {
  const pairs = shuffle(MATCH_PAIRS).slice(0, 4);
  const cards = shuffle(pairs.flatMap((p, k) => [{ t: p[0], k }, { t: p[1], k }]));
  let open = [], found = 0, lock = false;
  screen.innerHTML = `
    <section class="panel center">
      <button class="link" data-go="games">← Back to Word Games</button>
      <h1>🔗 Synonym Match</h1>
      <p>Flip two cards. If the words mean the same thing, they match!</p>
      <div class="memory">${cards.map((c, i) => `<button class="mem" data-i="${i}"><span>${c.t}</span></button>`).join("")}</div>
    </section>`;
  screen.querySelectorAll(".mem").forEach(el => el.onclick = () => {
    if (lock || el.classList.contains("flip")) return;
    el.classList.add("flip"); open.push(el);
    if (open.length < 2) return;
    const [a, b] = open.map(x => cards[+x.dataset.i]);
    if (a.k === b.k) {
      open.forEach(x => x.classList.add("got")); open = []; found++;
      if (found === pairs.length) { S.gamesWon++; earn(8, "Board cleared!"); setTimeout(match, 1500); }
    } else {
      lock = true;
      setTimeout(() => { open.forEach(x => x.classList.remove("flip")); open = []; lock = false; }, 900);
    }
  });
}

// ---------- catalog ----------
let catFilter = "All";
function catalog(filter) {
  if (filter) catFilter = filter;
  const cats = ["All", ...new Set(CATALOG.map(c => c.cat))];
  const items = CATALOG.filter(c => catFilter === "All" || c.cat === catFilter);
  screen.innerHTML = `
    <section class="panel">
      <div class="catalog-head">
        <h1>🛍️ The Prize Catalog</h1>
        <div class="wallet-big">You have <b class="gold">★ ${S.tokens}</b></div>
      </div>
      <div class="tabs">${cats.map(c => `<button class="tab ${c === catFilter ? "on" : ""}" data-go="catalog" data-arg="${c}">${c}</button>`).join("")}</div>
      <div class="cat-grid">${items.map(it => {
        const own = S.owned.includes(it.id), afford = S.tokens >= it.price;
        return `<div class="item ${own ? "owned" : ""}">
          <div class="item-art" ${it.theme ? `style="background:${it.theme}"` : ""}>${it.theme ? "" : it.icon}</div>
          <b>${it.name}</b>
          <span class="price">★ ${it.price}</span>
          ${own ? `<span class="tag">✔ Owned</span>`
                : `<button class="btn buy" data-id="${it.id}" ${afford ? "" : "disabled"}>${afford ? "Buy it!" : `Need ${it.price - S.tokens} more`}</button>`}
        </div>`;
      }).join("")}</div>
    </section>`;
  screen.querySelectorAll(".buy").forEach(b => b.onclick = () => {
    const it = CATALOG.find(c => c.id === b.dataset.id);
    if (S.tokens < it.price) return;
    S.tokens -= it.price; S.owned.push(it.id);
    if (it.slot === "theme") S.theme = it.id; else S.placed.push(it.id);
    save(); toast(`You got the ${it.name}! It's in your Clubhouse.`);
    catalog();
  });
}

// ---------- clubhouse ----------
function clubhouse() {
  const theme = CATALOG.find(c => c.id === S.theme);
  const placed = S.placed.map(id => CATALOG.find(c => c.id === id)).filter(Boolean);
  const ownedItems = S.owned.map(id => CATALOG.find(c => c.id === id)).filter(Boolean);
  screen.innerHTML = `
    <section class="panel">
      <h1>🏡 ${esc(S.name)}'s Clubhouse</h1>
      <div class="room" style="${theme ? `background:${theme.theme}` : ""}">
        <div class="wall-row">${placed.filter(p => p.slot === "wall").map(p => `<span class="deco wall">${p.icon}</span>`).join("") || `<span class="empty">Your walls are bare… buy posters in the Catalog!</span>`}</div>
        <div class="window">🌤️</div>
        <div class="floor">
          ${buddyArt(buddy(), .9)}
          ${placed.filter(p => p.slot === "floor").map(p => `<span class="deco floor-item">${p.icon}</span>`).join("")}
        </div>
      </div>
      <h2>My Stuff</h2>
      ${ownedItems.length ? `<p>Click an item to put it in or take it out of your room.</p>
        <div class="stuff">${ownedItems.map(it => {
          const on = it.slot === "theme" ? S.theme === it.id : S.placed.includes(it.id);
          return `<button class="stuff-item ${on ? "on" : ""}" data-id="${it.id}">${it.theme ? "🎨" : it.icon}<small>${it.name}</small></button>`;
        }).join("")}</div>`
        : `<p>You don't have any prizes yet. <button class="link" data-go="library">Read a story</button> to earn tokens!</p>`}
    </section>`;
  screen.querySelectorAll(".stuff-item").forEach(b => b.onclick = () => {
    const it = CATALOG.find(c => c.id === b.dataset.id);
    if (it.slot === "theme") S.theme = S.theme === it.id ? null : it.id;
    else S.placed = S.placed.includes(it.id) ? S.placed.filter(x => x !== it.id) : [...S.placed, it.id];
    save(); clubhouse();
  });
}

// ---------- boot ----------
let resetArmed = false;
$("#resetBtn").onclick = () => {
  const btn = $("#resetBtn");
  if (!resetArmed) {
    resetArmed = true; btn.textContent = "Tap again to erase everything";
    setTimeout(() => { resetArmed = false; btn.textContent = "Start over"; }, 3000);
    return;
  }
  resetArmed = false; btn.textContent = "Start over";
  try { localStorage.removeItem(KEY); } catch {}
  S = fresh(); renderWallet(); go("home");
};
renderWallet();
go("home");
