# Ink Brawl — Dev Plan

**Play:** https://cipoklean.eu.cc/ink/ · Solo build by cipoklean · Loadout AI Game Competition

Stick-figure duels on a notebook page. Your rival learns how you fight, then counters it.

## The hook
Most fighting-game AI is a difficulty slider. In Ink Brawl, each rival watches what you do. It counts how often you jab, kick, uppercut, sweep, block, jump and throw ink, then predicts your next move and counters it. A **READING YOU** meter shows how well it has you figured out, and taunt bubbles call out your habits ("Another jab? Predictable."). If you spam one move, you lose. To win, you have to keep changing up how you fight.

## What's playable now
- 1v1 fights with Smash-style damage %. Knock your rival off the paper to win the round. Matches are best of 3 with a 60 s timer.
- Moves: jab, kick, uppercut, sweep (low, beats block), block, timed parry, dash, double jump.
- Ink special: a meter fills as you fight. A full meter throws an ink blot, which you can dodge by ducking under it with a sweep or jumping over it. Blocking it costs a little damage; a timed parry reflects it. Rivals learn to dodge it and throw their own.
- A ladder of 8 rivals, each with its own personality and learning speed: Doodle, Scribble, Blot, Smudge, Quill, Sketch, Stencil, The Editor.
- Player names and XP ranks, from Doodler up to Legend of the Page.
- Touch controls built for phones, plus keyboard on desktop.
- Pause screen with the full controls.
- Procedural music and sound, made in code with no audio files.
- Everything is drawn in code too, with no image files. It loads instantly on weak connections.

## How the adaptive AI works
- Every action the player takes is added to a habit table. Older actions count less over time, so the rival keeps up when the player changes style.
- How much a rival trusts its read grows with how much it has seen, scaled by its personality. Later rivals learn faster and react sooner.
- The rival picks its counter from the player's most likely next move:
  - It blocks or parries an expected strike.
  - It jumps an expected sweep.
  - It uppercuts a player who jumps a lot.
  - It sweeps a player who blocks a lot.
- Fairness rules:
  - Only two rivals can parry, and they rarely parry jabs.
  - A blocked attack leaves the attacker open, so blocking and then hitting back is a real option for both sides.
- I tune balance with a headless simulator that plays hundreds of matches using different bot styles (a jab-only spammer and a mixed fighter). A spammer should stall around the last rival, while a player who mixes up their moves can clear the ladder.

## How AI was used to build it
I designed the game, playtested every build on my Android phone, and directed each change. An AI coding agent (Hark) wrote and tuned the vanilla JavaScript/Canvas code from that direction. It ran the balance simulations and fixed the issues I found in play, including mobile zoom, rivals parrying too often, the lack of a pause, and difficulty spikes.

## Roadmap
1. **Week 1–2: polish.** More hit animations, stage hazards (a page that tears, an ink spill), and a short tutorial fight.
2. **Week 3–4: rival memory.** Each rival remembers you between sessions and opens the next fight with a counter to your favourite move. A post-match "how it read you" breakdown.
3. **Month 2: online.** Ghost rivals trained on real players' habits, then a daily challenge against the community's ghost and a leaderboard by rank.
4. **Month 3: depth.** Unlockable fighters with different move sets, cosmetic inks earned through rank, and local 2-player mode.
5. **Later: on-chain extras.** Optional collectible ink colours and season ranks, without paywalling the core game.

## Tech
Vanilla JS + HTML Canvas + WebAudio, with no build step and no dependencies. Hosted on GitHub Pages. Saves are stored on your device.
