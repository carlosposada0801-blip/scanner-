// Feedback effects: soft synthesized sounds, haptics, confetti.
(function () {
  let ctx = null;
  const audio = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  function tone(freq, start, dur, { type = 'sine', gain = 0.12 } = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Pentatonic scale so rising combos always sound pleasant.
  const PENTA = [0, 2, 4, 7, 9];
  const noteAt = (i) => 523.25 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);

  const Fx = {
    enabled: () => Engine.state.settings.sound,
    sound(kind, n = 0) {
      if (!this.enabled()) return;
      try {
        if (kind === 'tick') tone(noteAt(Math.min(n, 14)), 0, 0.18, { gain: 0.07 });
        else if (kind === 'wrong') { tone(180, 0, 0.16, { type: 'triangle', gain: 0.09 }); }
        else if (kind === 'miss') { tone(220, 0, 0.12, { type: 'triangle', gain: 0.07 }); tone(165, 0.08, 0.2, { type: 'triangle', gain: 0.07 }); }
        else if (kind === 'pass') [0, 2, 4].forEach((k, i) => tone(noteAt(k + 5), i * 0.08, 0.35, { gain: 0.08 }));
        else if (kind === 'fanfare') [0, 2, 4, 5, 7].forEach((k, i) => tone(noteAt(k + 5), i * 0.09, 0.6, { gain: 0.08 }));
        else if (kind === 'tap') tone(880, 0, 0.06, { gain: 0.03 });
      } catch (e) { /* audio unavailable */ }
    },
    haptic(pattern) {
      if (Engine.state.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
    },
  };

  // ---------- confetti ----------
  const canvas = () => document.getElementById('fx');
  let parts = [], running = false;
  const COLORS = ['#ffd36e', '#ff8fb1', '#8fd3ff', '#b69cff', '#7cf0c5', '#ffffff'];

  Fx.confetti = (count = 140, origin) => {
    const c = canvas(); if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const ox = origin ? origin.x : innerWidth / 2, oy = origin ? origin.y : innerHeight * 0.35;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      parts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[i % COLORS.length], life: 0, max: 90 + Math.random() * 60,
      });
    }
    if (!running) { running = true; requestAnimationFrame(step); }
  };

  function step() {
    const c = canvas(), g = c.getContext('2d'), dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life < p.max);
    for (const p of parts) {
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - p.life / p.max);
      g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.life / 6)));
      g.restore();
    }
    if (parts.length) requestAnimationFrame(step);
    else { running = false; g.clearRect(0, 0, innerWidth, innerHeight); }
  }

  window.Fx = Fx;
})();
