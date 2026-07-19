# Uplandin — Design Plan

A retro upland bird-hunting game: you and your bird dog work real coverts across
the country. Top-down field view while the dog hunts; Duck Hunt-style shooting
view when a bird flushes in range. TypeScript + Phaser 3 + Vite, PWA-bound.

This is the living spec. Sections are marked **[built]** or **[planned]**.
Check items off (and adjust them) as tranches ship.

## Design pillars

- **The dog is the game.** Finding, pointing, holding, retrieving — your job is
  to read the dog, the wind, and the clock.
- **Hunting realism over arcade realism.** Wind, nerve, wild flushes, protected
  birds, puppy mistakes. Target discrimination makes it a hunting game.
- **Progression you feel.** A level-1 dog is bad in specific, visible ways;
  a level-10 dog is a partner. Gear changes what questions you can answer.
- **Everything important is data.** Species, breeds, areas, and gear are
  configs, not code. Sim logic is pure TypeScript, engine-free, unit-tested.

## Core loop **[built]**

1. Field view (top-down): dog quarters, scents, points. Tap to walk the hunter.
2. Dog on point → bird nerve drains → walk in before the bird flushes wild.
3. Bird flushes with hunter in range → shooting view: 2 shells, lead the bird.
4. Dog retrieves downed birds. Hunt ends → summary → career records.

## Field layer

- World per area is larger than the 480×270 viewport (1000×640 to 1400×800,
  tuned per area) with a camera following the **hunter** — never the dog.
  Cover and landmark trees scatter from a fixed per-area seed, so every visit
  to a covert finds the same ground. **[built]**
- The dog quarters **anchored to the hunter's position** out to its Range
  radius (130px × Range multiplier); big-running breeds work off-screen.
  What the edge arrow shows is gear-gated (see Progression & gear): nothing
  on the bell, point-only on the beeper, always + distance on GPS. **[built]**
- **Sprint** (double-tap or hold shift): 2× hunter speed, but loud — hidden
  birds within ~30px flush underfoot and pointed birds' nerve drains ~1.6×
  faster while running. **[built]**
- Whistle recall **[built]**; whistle only carries ~250px — big-ranging dogs
  can be out of earshot ("out of earshot..." toast). **[built]**
- **Bell** (tier-0 tracking gear): tinkles while the dog moves, fades with
  distance, silent on point. **[built]**
- Bird stocking is density-per-area (`stocking` per 100k px²) so bigger
  worlds don't feel empty. **[built]**

## The dog

### Breeds **[built]** — stats are 1–5 multipliers on `Dog` constants

| Breed | Nose | Speed | Range | Steady | Stamina | Notes |
|---|---|---|---|---|---|---|
| German Shorthaired Pointer | 4 | 4 | 3 | 4 | 4 | All-rounder |
| English Pointer | 4 | 5 | 5 | 4 | 3 | Big-running specialist |
| English Setter | 4 | 3 | 5 | 5 | 3 | Rock-steady, methodical |
| German Wirehaired Pointer | 5 | 3 | 3 | 4 | 5 | Rugged, great nose |
| Vizsla | 3 | 4 | 2 | 3 | 3 | Close-working, fast XP |
| Pudelpointer | 5 | 3 | 3 | 4 | 4 | Nose + retrieve drive |
| American Brittany | 3 | 4 | 3 | 3 | 4 | Snappy, closer range |
| French Brittany | 4 | 3 | 2 | 4 | 4 | Steadier than American |
| Deutsch-Drahthaar | 5 | 3 | 3 | 4 | 4 | Premium nose, slow XP |
| Wirehaired Pointing Griffon | 5 | 2 | 2 | 5 | 4 | Deliberate, stays close |
| Irish Setter | 4 | 5 | 4 | 2 | 2 | Flashy, peaks early, fast XP |

Stat mapping: Nose→scent radius, Speed→ground speed, Range→quarter width,
Steadiness→mistake resistance, Stamina→hunt-day endurance.

### Leveling & the puppy arc **[built]**

- Dog XP: held point that produces a flush **+2**, retrieve **+1**, bird downed
  over their point **+3**. Cap level 10, thresholds ~`20 × level^1.5`.
- Growth: +5%/level on the breed's two strongest axes, +3% on the rest,
  hard cap +40% (breeds keep identity).
- **Nose maturity**: effective scent = breed nose × (0.7 + 0.03 × level).
- **Creep & bump** (puppy mistakes): on point, a young dog may creep forward;
  inside bump distance the bird flushes wild, no shot. ~25%/point at level 1
  for soft breeds → ~2% at level 10.
- **Point pressure**: bird nerve drains faster under a crowding puppy (~1.4×)
  and slower under a veteran who gives the bird room (~0.6×). Experienced
  dogs also point from slightly farther out.
- **Wind craft**: levels 1–3 the dog gets no upwind scent bonus AND birds
  within ~30px downwind of it catch its scent and flush wild. 4–7: full
  upwind bonus, dog-scent radius ~15px. 8+: birds effectively never scent a
  quartering dog.
- **Steady to wing & shot**: finished dogs stand through flush + shot and mark
  the fall; puppies **break chase** and can bump birds they run past while
  you're in the shooting view.
- **Fatigue**: work drains stamina; tired dogs are slower *and sloppier*
  (nose drops a tier, creep chance up). Recall ends at heel; the dog recovers
  there until a second whistle casts it off again.
- **Marking**: instant retrieve if the dog watched the fall; breaking chase
  means the next retrieve needs a search first.

## The birds **[built — all 14 species]**

Species are configs (`species.ts`): covey size range, runner chance (plus a
run-speed multiplier — chukar and scaled quail outwalk you), nerve range,
escape-flight style (speed/climb/wobble), palette, flush sound, and special
rules. Areas carry a weighted `speciesMix`; weights mean share of *birds*
(spawn normalizes by covey size so a 9-bird hun covey doesn't eat the
stocking).

All 14 built: bobwhite, ringneck (hen/rooster rule), ruffed grouse,
woodcock, sharptail, Hungarian partridge, chukar (fast runner; the flattest,
fastest flush in the game — the downhill escape), greater prairie chicken,
blue grouse (holder), and California, Gambel's, scaled (runner), Montezuma
(tightest sitter, never runs), and mountain quail.

Archetypes:

- **Holders**: woodcock, bobwhite + quail species, blue grouse — high nerve,
  sit tight, explode late. Woodcock: solitary, famously confiding.
- **Runners**: ringneck, chukar — flee the dog on foot; chukar runs uphill and
  flushes *downhill*, fast (escape-direction bias).
- **Wild-flushers**: Hungarian partridge, sharptail, prairie chicken, ruffed
  grouse — short nerve, flush far out; often no shot offered.

Full list (14): ringneck pheasant, sharptailed grouse, greater prairie
chicken, woodcock, ruffed grouse, blue grouse, Hungarian partridge, chukar,
northern bobwhite, and California, Gambel's, scaled, Montezuma (Mearns), and
mountain quail.

Special rules:

- **Hen/rooster pheasant** **[built]**: hens flush too but are protected —
  a downed hen is a 4-xp game-warden fine at the summary. Visually distinct
  (tan/short tail vs white ring/green head/long tail). Roosters cackle on
  the flush; hens rise silent. The shot view warns "watch for hens!".
- **Scattered singles** **[built]**: covey survivors of a shooting
  opportunity relight 90–200px away in cover, hold ~1.7× tighter, and sit
  alone (the covey bond breaks — one single flushing doesn't lift another).
  A single only relights once; wild-flushed-too-far birds are gone for good.
- **Flush sounds** **[built]**: rooster cackle, woodcock wing twitter,
  ruffed grouse thunder.

## Wind **[built — extensions planned]**

- Fixed direction per hunt, HUD arrow; upwind scent ~1.9×, downwind ~0.35×. **[built]**
- Per-hunt strength (calm/breezy/strong, shown in the HUD): strong wind
  carries scent ~1.25× farther but shortens bird nerve ~20% and carries the
  dog's own scent ~1.3× farther to downwind birds. **[built]**
- Birds scent the dog downwind (see wind craft). **[built]**

## Meta layer **[partially built]**

- **Game modes** **[built]**: the title offers **Career** (raise your dog,
  work the map, everything below) and **Quick Hunt** — pick any breed, level
  1–10, covert, and wind; everything unlocked, nothing saved to the career.
  Last quick setup is remembered. Doubles as the permanent testing surface.
- Title screen, area select, career totals **[built]**.
- Continental-US travel map (`MapScene` → region area select) **[built]**:
  all 7 regions open (11 areas); home ground is free, the rest need the
  truck (hunter lv 2).
- The 7 regions:
  North Woods (ruffed, woodcock) · Prairie Pothole (ringneck, sharptail, Huns,
  prairie chicken) · Southern Plains (bobwhite — starting region) · Sonoran
  Desert (Gambel's, scaled, Mearns) · Great Basin rimrock (chukar, Huns) ·
  High Rockies/Cascades (blue grouse, mountain quail) · Pacific Valleys
  (California quail).
- Career save: v2 localStorage with `version`, kennel, active dog, hunter
  profile, and unlocked regions; v1 saves migrate. **[built]**
- First-run flow: breed select (stat bars) + puppy naming, then the kennel
  drives every hunt. **[built]**

## Progression & gear **[built — two-dog hunting remains]**

Everything derives from hunter level; no purchase economy (yet). Level-ups
announce their unlocks at the hunt summary.

- Hunter XP **[built]**: bird downed +1, double on one flush +1 bonus, hunt
  completed +2. Thresholds ~`10 × level^1.5`, cap 10.
- Shotguns **[built]** — swap at the gun rack on the travel map; Quick Hunt
  has them all:

  | Gun | Shells | Cooldown | Spread | Unlock |
  |---|---|---|---|---|
  | Remington 870 pump (start) | 3 | 500ms | 14 | — |
  | Semi-auto | 3 | 250ms | 14 | hunter lvl 3 |
  | Over/under | 2 | none | 16 | hunter lvl 5 |
  | Handmade side-by-side | 2 | none | 18 | hunter lvl 8 |

- **Truck** **[built]**: hunter lvl 2 opens travel beyond the home region.
- **Dog box / kennel** **[built]**: slots 1→3 (lvl 4)→5 (lvl 7); the kennel
  screen switches the active dog and raises new puppies (a fresh pup always
  rides along next). Two-dog hunting still needs T5.
- Dog tracking gear **[built]** — best earned tier auto-equips; Quick Hunt
  picks any:
  - Tier 0 **bell** (start): tinkles while the dog moves, fades with
    distance, *goes silent on point* — tells you that, not where.
  - Tier 1 **beeper collar** (lvl 3): locate beeps on point + edge arrow
    while pointing.
  - Tier 2 **GPS handheld** (lvl 6): edge arrow whenever off-screen + live
    distance.
  - Tier 3 **GPS + map** (lvl 9): corner minimap with hunter/dog (gold on
    point) + remote recall at any range.
- Two-dog hunting: second `Dog` instance; **honoring** — when one dog points,
  the other stops and backs. **[planned — T5]**

## Tranche sequence

- **T0 — core loop [shipped]**: field + flush scenes, dog AI, coveys, retrieve,
  audio, wind direction, runners/roading, whistle, bird nerve + wild flushes +
  range gate, areas as data, title/area select, career v1.
- **T1 — dogs [shipped]**: breed configs, puppy selection + naming, dog
  XP/levels, puppy mistakes (creep/bump, pressure, wind craft,
  breaking/steady-to-wing), fatigue/heel, marking, save v2 + kennel.
- **T1.5 — moving world [shipped]**: bigger per-area worlds (seeded cover,
  density stocking), hunter-follow camera, hunter-anchored quartering, sprint
  (+underfoot flushes), whistle range, bell + basic edge arrow, stamina pool
  resized for the bigger ground (90s base).
- **T2 — map & species pack 1 [shipped]**: US travel map + 4 starter regions
  (6 areas); bobwhite, ringneck w/ hen-rooster rule, ruffed, woodcock,
  sharptail, Huns; scattered singles; wind strength; escape-flight styles +
  flush sounds; `?doglevel=N` dev override.
- **T2.5 — game modes [shipped]**: Career vs Quick Hunt split; quick setup
  screen (breed/level/covert/wind pickers), career isolation, remembered
  setup.
- **T3 — hunter progression [shipped]**: hunter XP/levels with summary
  unlock callouts, the four shotguns (shells/cooldown/spread in the shot
  view, gun rack on the map), truck region gating, kennel screen + dog box
  slots, tracking-gear tiers (beeper/GPS/GPS+map, minimap, remote recall);
  gun + gear rows in Quick Hunt.
- **T4 — species pack 2 [shipped]**: chukar (fast runner, flat downhill
  flush), prairie chicken, blue grouse, the 5 quail species, per-species
  run speed; Sonoran Desert, High Rockies, and Pacific Valleys open
  (5 new areas, 11 total).
- **T5 — two dogs**: second instance, honoring, shared retrieves.
- **Anytime**: PWA packaging; art pass (after species settle); distance-scaled
  shot views (`flushDistance` already plumbed).

## Engineering rules

- `src/game/` stays pure TypeScript — no Phaser imports; unit-tested with
  Vitest. Scenes are thin rendering/input shells.
- New mechanics ship with tests and a playable build every commit.
- Tuning lives in named constants at the top of the relevant module.
