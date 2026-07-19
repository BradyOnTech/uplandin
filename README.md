# Uplandin

A retro upland bird-hunting game. You raise a bird dog and work real coverts
across a pixel continental US: top-down field view while the dog quarters and
points, a Duck Hunt-style shooting view when a bird flushes in range. Built
with TypeScript, Phaser 3, and Vite. Installable as a PWA: serve the
production build over HTTPS, open it on your phone, and "Add to Home
Screen" — it runs fullscreen landscape and boots from cache offline.

**Status: the full design plan is shipped** — tranches T0 through T7, ~170
unit tests green. The living spec is [docs/DESIGN.md](docs/DESIGN.md); this
README is the summary.

## Playing

```bash
npm install
npm run dev     # Vite dev server (usually http://localhost:5173)
npm test        # Vitest suite over the pure sim
npm run build   # production build
```

Two modes from the title screen:

- **Career** — the full simulation: raise a puppy, pick a home region, and
  hunt a September–January season a weekend at a time.
- **Quick Hunt** — everything unlocked, nothing saved: pick any breed, level,
  covert, wind, weather, gun, gear, and an optional second dog. Doubles as
  the testing surface.

Dev helpers: `?doglevel=N` on the URL runs career hunts at that dog level
(save untouched); press `B` in the field to peek at hidden birds;
`window.__uplandin` exposes the Phaser game for console inspection.

## What's built

### The dog (the game)
- **11 breeds** with 1–5 stat spreads (nose, speed, range, steadiness,
  stamina) and per-breed XP rates — a Griffon and an Irish Setter are
  different animals.
- **The puppy arc**: levels 1–10 earned in the field. Young dogs creep and
  bump birds, crowd points, ignore the wind, break chase at the flush, and
  need a search to find falls; finished dogs are steady to wing and shot.
- **Fatigue** (tired dogs are slower and sloppier), whistle recall to heel,
  hunter-anchored quartering out to the breed's range.
- **Two-dog braces** (hunter lv 7): the second dog **honors** its
  packmate's point — or, if it's young and soft, steals it. Per-dog XP
  credit; the retrieve goes to whoever reaches the fall first.
- **Aging on the calendar**: growing pup, prime seasons 2–7, then a soft
  speed/stamina decline. The nose holds. No forced retirement.

### The birds
- **All 14 species** as data: bobwhite, ringneck (protected hens — a
  game-warden fine), ruffed grouse, woodcock, sharptail, Hungarian
  partridge, chukar, prairie chicken, blue grouse, and California,
  Gambel's, scaled, Montezuma, and mountain quail.
- Real personalities: holders, runners (chukar and scalies outwalk you),
  and wild-flushers; coveys, scattered singles that relight and hold
  tight, hun coveys that circle back and reland, rooster cackles, woodcock
  twitter, grouse thunder.
- **Season-aware birds**: naive young-of-year in September, educated
  survivors by December.

### The hunt
- Per-area worlds bigger than the screen, seeded cover so every covert is
  the same ground each visit, camera on the hunter, sprint (loud), bird
  nerve vs. your walk-in.
- **Wind** (direction + strength) shaping dog scent and bird spook, and
  **weather** (frost/hot/rain/snow) trading scent, holds, stamina, and
  marking.
- **Fieldcraft**: the chukar slope rule (approach from above — they hold,
  and the flush drops away below you), flanking points, blocking runners at
  the end of cover, grouse timber screens in the shot view.
- Shooting view on Duck Hunt rules: waves of three readable targets,
  per-species size/wingbeat/glide/level-off, ground shadows, feather
  bursts on hits, falling snow and rain, four shotguns (shells vs.
  cooldown vs. spread), doubles bonus, hen discrimination.

### The career
- **Seasons & time**: a ~22-week September–January calendar. Home hunts
  cost a weekend, trips two weeks; species openers stagger across the fall
  (grouse Sept 1 → pheasant mid-October → Mearns quail in December);
  summer rolls everyone a season older.
- **A continental US travel map**: 7 regions, 11 coverts, home region
  chosen at career start, the truck (hunter lv 2) to travel.
- **Hunter progression** to level 10: shotguns, dog-box kennel slots
  (raise multiple dogs, pick who rides along), and tracking gear — bell →
  beeper collar → GPS handheld → GPS + map with minimap and remote recall.
- Career persistence in localStorage with migrations from every earlier
  save shape.

## Architecture

- `src/game/` — the entire simulation as pure, engine-free TypeScript
  (dog AI, birds, species, breeds, wind, conditions, fieldcraft, seasons,
  guns, progression, career). Everything important is data; tuning lives
  in named constants — **[docs/TUNING.md](docs/TUNING.md) maps every knob**,
  including the full flush-pipeline walkthrough. Covered by the Vitest
  suite in `test/`.
- `src/scenes/` — thin Phaser scenes (title, breed, map, kennel, quick
  setup, field, flush) that render and route input.
- 480×270 internal resolution, pixel-scaled; procedural WebAudio sound —
  no asset files anywhere.

## What's left

- **Art pass** — underway: style locked (docs/ART.md), Southern Plains
  flush backdrop and animated bobwhite sprites are in-engine; remaining
  species, tiles, and scenes still placeholder.
- Time-of-day fieldcraft (low sun, glare) and distance-scaled shot views.
- Open design decision: how (or whether) old dogs retire.

## Development log

| Tranche | Shipped |
|---|---|
| T0 — core loop | field + flush scenes, dog AI, coveys, retrieves, wind, areas, career v1 |
| T1 — dogs | 11 breeds, puppy selection/naming, XP + levels, puppy mistakes, save v2 |
| T1.5 — moving world | big per-area worlds, hunter camera, anchored quartering, sprint, whistle range, bell |
| T2 — map & species pack 1 | US travel map, 6 species, hen/rooster rule, singles, wind strength |
| T2.5 — game modes | Career vs Quick Hunt split, career isolation |
| T3 — hunter progression | hunter XP, 4 shotguns, truck gating, kennel + dog box, gear tiers |
| T4 — species pack 2 | the last 8 species, per-species run speed, all 7 regions open |
| T5 — two dogs | braces, honoring, per-dog credit, shared retrieves |
| T6 — fieldcraft | slope, weather conditions, hun circle-back, timber screens, blocking, flanking |
| T7 — seasons & time | week-tick calendar, home region, openers, young/educated birds, dog aging |
