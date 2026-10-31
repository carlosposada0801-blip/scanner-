# Hidden Word

> “Thy word have I hid in mine heart, that I might not sin against thee.” — Psalm 119:11

A Bible verse memorization app with a liquid-glass design. It uses spaced repetition, retrieval practice, and game-style rewards to help you learn verses.

## How to use it

It's a static web app with no build step and no dependencies.

- **Try it locally:** open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.
- **Put it on your phone:** host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages). Then, in Safari, tap **Share → Add to Home Screen**. It runs full-screen and works offline.

Progress is saved on the device (localStorage). Use **Progress → Backup → Export** to save a copy.

## How memorization works

There's no fixed daily plan. Each time you tap **Continue**, the app decides what you need right now.

1. **Learning ladder (cue fading).** Each new verse goes through 5 steps, and each step gives you less help:
   Read aloud → Fill the gaps (35% hidden) → Fewer clues (70% hidden) → First letters only → From memory.
   You must pass a step before moving on. If you miss one, it comes back a little later in the session instead of right away.
2. **Retrieval practice.** You type the **first letter** of each word as you say it in your head. That forces real recall, and it's quick on a phone.
3. **Spaced repetition.** Once you know a verse, its first check is **tomorrow** (sleep helps lock it in). After that the gaps grow: about 3 days, a week, 3 weeks, and so on (SM-2 style intervals with an ease factor). Your score on each check sets the next interval. If you forget a verse, it drops back to one day and gets a quick rebuild in the same session.
4. **Interleaving.** Checks on past verses are mixed in between the steps of your new verse. Occasionally a surprise **Flashback** brings back an older verse, so nothing fades.
5. **Load balancing.** If more than 10 checks are waiting, the app has you catch up before adding new verses.

**Memory strength** estimates your chance of remembering a verse right now. It's about 90% when the verse comes due, then follows a forgetting curve.

## Rewards

- XP for every word you recall on the first try, with a **combo** bonus for streaks of correct words.
- Daily XP goal ring, day streaks, levels (Seed → Sprout → … → Elder), and 14 badges.
- Confetti, sounds, and haptics when you memorize a verse. You can turn sounds and haptics off in settings.

## Verses

Four built-in collections (59 verses) in the **King James Version** (public domain): *Start Here*, *Peace & Courage*, *Walking with Christ*, and *Hope & Mission*. When you finish one, the next starts automatically.
Use **Library → +** to add any verse in any translation (NIV, ESV, NLT…).

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Glass design system (light and dark follow the system setting) |
| `js/verses.js` | Verse collections |
| `js/engine.js` | Scheduling, session building, XP, levels, badges, storage |
| `js/fx.js` | Synthesized sounds, haptics, confetti |
| `js/app.js` | Screens, practice session, keyboard |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline support and installable app |
