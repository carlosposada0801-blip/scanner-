# Hidden Word

> “Thy word have I hid in mine heart, that I might not sin against thee.” — Psalm 119:11

A Bible verse memorization app with a liquid-glass design. It uses spaced repetition, retrieval practice, and game-style rewards to help you learn verses.

## How to use it

It's a static web app with no build step and no dependencies.

- **Try it locally:** run `python3 -m http.server` in this folder and visit http://localhost:8000. Opening `index.html` directly also works, but voice and share links need a real web address.
- **Put it on your phone (GitHub Pages):**
  1. Make this branch the repository's default branch (or merge it into the default branch).
  2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
  3. The workflow in `.github/workflows/pages.yml` publishes the app at `https://<your-username>.github.io/<repo>/`.
  4. Open that address in Safari and tap **Share → Add to Home Screen**. It runs full-screen and works offline.

Progress is saved on the device (localStorage). To move to another device, use **Progress → Move to another device**, or export a backup file.

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

## Other features

- **Six translations:** BSB (default), KJV, and ASV are built in. **NIV, ESV, and NASB** are copyrighted, so they aren't stored in this repository. The first time you learn a verse in one of them, the app asks you to paste it from your Bible app (with a Bible Gateway link). It strips verse numbers and footnote letters and saves the text **only on your device**. With a free personal ESV API key (Settings), ESV verses fill in automatically. Each verse keeps the translation you learned it in, and the verse page lets you compare translations or restart a verse in another one.
- **"Where is it?" quizzes** ask you to pick the right reference, so you know where each verse is, not just its words.
- **Say it out loud:** tap 🎙️ during practice and recite the verse. Speech recognition checks it word by word and allows for sound-alikes and KJV wording ("believeth" / "believes").
- **Personal notes:** write why a verse matters to you, right after you memorize it or from the verse page. They show again when you practice that verse.
- **Passages:** Psalm 23, the Lord's Prayer, John 1:1-5, Isaiah 53:4-6, and the Beatitudes. Learn them verse by verse; the whole passage unlocks once each verse is known.
- **Topics and search:** Anxiety & Fear, Forgiveness, Temptation & Purity, Love & Marriage, Grief & Comfort, Identity in Christ, and Purpose & Direction. Search by feeling ("afraid", "lonely") or by words in the verse.
- **Sabbath rest day:** pick a day (Sunday by default) that never breaks your streak.
- **Daily reminder:** adds a repeating calendar event with an alert, so it works even when the app is closed.
- **Challenges:** send a friend or small group a verse link. They learn it in the same translation, and you compare accuracy and time.
- **Move to another device:** a link that carries your progress, compressed in the link itself. It is never uploaded anywhere.

### Without a server

The app has no server, so a few things work differently than in apps that have one:
- Reminders use your calendar instead of push notifications.
- Moving devices is a one-time copy, not live sync.
- Challenges compare scores when your friend finishes, but there is no shared leaderboard.

Live sync, push notifications, and group leaderboards would need accounts and a backend (for example Supabase or Firebase).

## Rewards

- XP for every word you recall on the first try, with a **combo** bonus for streaks of correct words.
- Daily XP goal ring, day streaks, levels (Seed → Sprout → … → Elder), and 14 badges.
- Confetti, sounds, and haptics when you memorize a verse. You can turn sounds and haptics off in settings.

## Verses

126 verses and 5 passages in 12 collections, each built in as **BSB**, **KJV**, and **ASV** (all public domain). When you finish a collection, the next one starts automatically.
Use **Library → +** to add any verse in any translation (NIV, ESV, NLT…).

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Glass design system (light and dark follow the system setting) |
| `js/verses.js` | Verse collections (generated by `tools/build_verses.py` from published KJV and BSB text, so no Scripture is typed by hand) |
| `tools/build_verses.py` | Builds `js/verses.js` from KJV, BSB, and ASV sources; its header lists them |
| `.github/workflows/pages.yml` | Publishes to GitHub Pages |
| `js/engine.js` | Scheduling, session building, XP, levels, badges, storage |
| `js/fx.js` | Synthesized sounds, haptics, confetti |
| `js/app.js` | Screens, practice session, keyboard |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline support and installable app |
