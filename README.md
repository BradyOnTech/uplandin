# Uplandin

A retro upland bird-hunting game. You raise a bird dog and work real coverts
across a continental US in either the original pixel presentation or an
open-world low-poly 3D presentation. Both renderers run the same hunt, dog,
bird, scoring, career, and progression simulation. Built with TypeScript,
Phaser 3, Three.js, and Vite. Installable as a PWA: serve the
production build over HTTPS, open it on your phone, and "Add to Home
Screen" — it runs fullscreen landscape and boots from cache offline.

**Work from `main`.** It contains the integrated mobile controls, generated dogs,
Quail Fields, Cattail Coverts, Chukar Ridge and Sharptail Prairie refinements,
and the shared menu redesign. Art and gameplay are still being refined.
See the [current menu review](docs/3d/menu-redesign-audit.md),
[production progress](docs/3d/production-finish.md), and
[game design](docs/DESIGN.md) for implementation and remaining acceptance work.

## Playing

Play online: [uplandin.brady-on-tech.workers.dev](https://uplandin.brady-on-tech.workers.dev/).

```bash
npm install
npm run dev     # Vite dev server (usually http://localhost:5173)
npm test        # Vitest suite over the pure sim
npm run build   # production build
```

Pushes or merges into `main` automatically build and publish to the same game
link through Cloudflare. See [deployment and updates](docs/deployment.md) for
release checks, player updates, and rollback.

Open `/` for the shared home and preparation flow. Choose the 3D or Classic 2D
hunting view through Play settings. `npm run dev:3d` also serves this flow;
`/index3d.html` remains the standalone 3D field entry.
The standalone Quail field defaults to the liver-and-white GSP and morning light.
`?drop=west-track` selects the second truck drop; `?quality=lite` selects lighter rendering.
`?dogstyle=smooth` or `?dogstyle=faceted` renders every dog in one art style (see the
[dog style study](docs/3d/dog-style-study.md) and `tools3d/dog-comparison.html`).
`tools3d/cattail-coverts-review.html` stages Cattail Coverts views in the real renderer
(see [the working farm](docs/3d/cattail-coverts-farm.md)); `node tools3d/review-cattail-coverts.mjs`
captures the same views headless.
Saved Career and Quick Hunt launches retain their selected dogs and gear.
In the 3D field you handle the dog with **Z** whoa, **X** hunt on (or relocate from a point),
**C** cast the way you face and **V** dead bird where you look, alongside **Q** whistle; on
touch these are Whoa and the Dog ▸ tray. See [handling and field craft](docs/3d/handling-and-field-craft.md).
For a phone playtest on the same Wi-Fi, run `npm run play:mobile` and open the
printed Network address. Preparation's Settings include the display
quality choice; phones select touch controls automatically. Add `&diagnostics=1`
to a field URL for the frame-time capture described in the handling doc.
See the [mobile playtest guide](docs/3d/mobile-playtest.md) for controls and validation limits.

**Training Grounds** opens from the home menu or a career dog's preparation card.
Ten short drills reuse Quail Fields, the existing dogs, and the shared simulation.
Career practice develops individual abilities toward breed potential; Quick
challenges award medals and personal bests. See [training controls and progression](docs/3d/training-grounds.md).

Two modes from the title screen:

- **Career** — the full simulation: raise a puppy, pick a home region, and
  hunt a September–January season a weekend at a time.
- **Quick Hunt** — everything unlocked, nothing saved: pick any breed, level,
  covert, wind, weather, gun, gear, and an optional second dog. Doubles as
  the testing surface.

The title screen also remembers a **2D / 3D** hunt preference. After choosing
a covert, a shared terrain map shows cover, trails, landmarks, and two truck
drop points. The selected truck, heading, dog spawn, and bird-free safety zone
are the same in either renderer.

**Independent 2D experiment:** Briar Glen is preserved in the same repository
under `src/twod/`, with its own assets and save key. It is separate from Classic
2D hunting. Run `npm run dev:2d` and open `/index2d.html`; `npm run build:2d`
creates `dist-2d/`. The normal build and home menu remain the hunting game.

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
  credit; the retrieve goes to whoever reaches the fall first, carries it
  back, and delivers it to hand.
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
- **Low-poly 3D families**: quail/partridge, long-tailed pheasant, broad
  grouse/prairie chicken, and long-billed woodcock rigs. Species keep their
  own size, palette, flight speed, wingbeat, glide, and grounded pose.

### The hunt
- Per-area worlds bigger than the screen, seeded cover so every covert is
  the same ground each visit, camera on the hunter, sprint (loud), bird
  nerve vs. your walk-in.
- Shared drop-point geography: park at a named gate/track, unload beside the
  truck, and hunt into a mapped first piece of cover. Birds never spawn in
  any vehicle safety zone.
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
- `src/scenes/` — Classic Phaser field/flush gameplay. Older selection scenes
  remain as historical source; normal navigation uses the shared native menus.
- `src/ui/` — the Classic field report; shared home, preparation and choice
  controls live in `src/three/` and serve both hunting views.
- `src/twod/` — the independent Briar Glen village and wildlife experiment,
  built through `vite.2d.config.ts` and `public2d/`.
- `src/three/` — the Three.js adapter and low-poly presentation. Its player,
  dog team, birds, gun, terrain, landmarks, and HUD consume the same shared
  hunt state; a rendered fall is written back before retrieval begins.
- 480×270 internal resolution, pixel-scaled; procedural WebAudio sound.
  Art arrives incrementally (`public/art/` + fallback maps in the scenes);
  the UI font is generated at boot from glyph data in `scenes/pixelFont.ts`.

## What's left

- **3D production slice** — [Quail Fields plan and quality gates](docs/3d/PRODUCTION-SLICE.md),
  [engine contract](ARCHITECTURE-3D.md), and [Blender GSP source](docs/3d/gsp-asset.md).
- **2D production polish** — historical roadmap in [`docs/PRODUCTION.md`](docs/PRODUCTION.md)
  (AI-only art finish path; no human pixel-artist gate). Style + prompts:
  [`docs/ART.md`](docs/ART.md). In-engine so far: SP flush plate, bobwhite,
  English Setter (4-frame gait + point), SP tiles, bitmap font, cover edge
  work + wind-aware cast. Vertical slice next: hunter sheet, seamless
  tiles, shell UI, field presentation (Y-sort, shadows, wind tell, transitions).
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
