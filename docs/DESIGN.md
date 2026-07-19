# Uplandin — Design Plan

A retro upland bird-hunting game: you and your bird dog work real coverts across
the country. Top-down field view while the dog hunts; Duck Hunt-style shooting
view when a bird flushes in range. TypeScript + Phaser 3 + Vite, installable PWA.

This is the living spec. Sections are marked **[built]** or **[planned]**.
Check items off (and adjust them) as tranches ship.

## Design pillars

- **The dog is the game.** Finding, pointing, holding, retrieving — your job is
  to read the dog, the wind, and the clock.
- **Hunting realism over arcade realism — in the field.** Wind, nerve, wild
  flushes, protected birds, puppy mistakes. Target discrimination makes it
  a hunting game. **The flush view is the opposite: pure Duck Hunt.** Up
  to three birds burst TOGETHER — the covey thunder — across shuffled
  lanes with a per-flush break direction; the next wave rises when the
  sky clears. A big covey is rounds of shooting, never a blob and never
  a single-file procession. Fun beats covey realism in this view.
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
- **Cover work** [built]: the dog hunts objectives, not open ground — it
  casts to likely cover, works it in a tight serpentine until it feels
  checked, and moves to the next patch, remembering what it's already
  combed. Sometimes the birds are right there, sometimes they take real
  working, often the cover is empty. Thoroughness scales with level: a pup
  pops out early and leaves birds behind.
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

Special rules:

- **Hen/rooster pheasant** **[built]**: hens flush too but are protected —
  a downed hen is a 4-xp game-warden fine at the summary. Visually distinct
  (tan/short tail vs white ring/green head/long tail). Roosters cackle on
  the flush; hens rise silent. The shot view warns "watch for hens!".
- **Scattered singles** **[built]**: ~65% of covey survivors of a shooting
  opportunity relight — the rest are simply gone. The ones that stay make
  for the next cover patch in range (sometimes surprisingly close, often a
  real hike, 70–420px; open country gets a long random put-down), hold
  ~1.7× tighter, and sit alone (the covey bond breaks). A single only
  relights once; wild-flushed-too-far birds are gone for good.
- **Flush sounds** **[built]**: rooster cackle, woodcock wing twitter,
  ruffed grouse thunder.
- **Target personality** **[built]** — tributes to realism inside the
  Duck Hunt view, all species data: per-species target `size` (a bobwhite
  is a 0.62-scale speck, a rooster a 1.15 barn door), wingbeat `flapRate`
  (quail buzz at 18fps, roosters row at 9), the quail move
  (`glideAfterMs`: burst, then wings lock and it glides off on a sink),
  and the rooster move (`levelAfterMs`: stops climbing and accelerates
  into a fast crossing shot — faster than it looks, like the real bird).
  Chukar bomb flat, woodcock flutter and wobble, grouse jink through
  timber — those were already in the flight data.
- **Flush variance** **[built]** — no two chances alike: per-bird speed
  rolls (0.85–1.3×), jink intensity (0.6–1.6×), shuffled lanes, a
  per-flush break direction, ~18% sleepers that rise a beat after their
  wave (the straggler at your feet), and **skill-linked difficulty**: how
  close you walked in sets the whole rise's size/distance — point-blank
  over a solid point is a big easy chance, a scramble at the edge of
  range is small birds already going away (`flushBias`). **Skill loads
  the dice, it never replaces them**: ~18% of rises are WILD regardless
  ("they're wild!" — small, hot, going away despite your perfect
  walk-in) and ~8% are gifts (they sat like stones despite your
  scramble). Even a perfect hunter gets surprised.

## Wind **[built]**

- Fixed direction per hunt, HUD arrow; upwind scent ~1.9×, downwind ~0.35×. **[built]**
- Per-hunt strength (calm/breezy/strong, shown in the HUD): strong wind
  carries scent ~1.25× farther but shortens bird nerve ~20% and carries the
  dog's own scent ~1.3× farther to downwind birds. **[built]**
- Birds scent the dog downwind (see wind craft). **[built]**

## Fieldcraft **[built — time of day remains]**

Situational hunting knowledge as mechanics: small, true-to-life edges that
reward playing like a hunter. Wind is the prototype — each is a per-area
or per-hunt condition plus a few multipliers, not a new engine.

- **Slope** **[built]** (per-area `slope` uphill direction, `uphill ↑` HUD
  cue): chukar run uphill and flush downhill — the real birds and the real
  tactic. Runners on sloped ground angle uphill as they flee. Approach a
  pointed covey from *above* and it holds (nerve ×0.6, escape cut off) and
  the flush drops away below you — slower, flatter, "shooting down the
  hill". From below: nerve ×1.4 and the flush rockets overhead at 1.15×.
  Live on Chukar Ridge (uphill north) and Timberline Parks (uphill east).
- **Conditions** **[built]** (per hunt, rolled like wind, in the HUD; areas
  carry a climate bias — Sonoran heat, high-country snow, North Woods
  rain): frost (scent ×1.15, birds hold ×1.25 — the good days), hot & dry
  (scent ×0.75, dog stamina drains ×1.5), rain (scent ×0.6, birds sit
  ×1.3, unmarked falls take ×1.4 to find), snow (tight holds, searches
  ×0.6 — easy marking in the white). Quick Hunt has a weather picker.
- **Hun circle-back** **[built]**: a wild-flushed hun covey flies a wide
  loop and relands together in the same field, once per hunt — "mark
  them!" — then it's gone for good.
- **Grouse timber screens** **[built]**: ruffed and blue grouse flush
  behind timber — trees in the shot view that the pattern can't punch
  through ("thwack — timber!", shell spent).
- **Blocking runners** **[built]**: a runner that reaches the end of its
  cover holds rather than crossing open ground — pinch roosters at the end
  of a slough.
- **Walk-in craft** **[built]**: flanking a point (the bird between you
  and the dog) instead of walking up the dog's back — nerve ×0.75.
- **Time of day** **[planned]**: evening hunts drop the sun low — westward
  flushes glare in the shot view; morning birds sit tighter near roost.

## Seasons & time **[built]**

Time is the career's scarce resource. A season is ~22 week-ticks, September
through January; everything below hangs off the week counter. Quick Hunt
stays timeless.

- **The calendar** **[built]**: a hunt near home costs 1 week (a weekend); a trip to
  any other region costs 2 (travel). Skipping weeks is free (calendar
  screen: "skip to November"). A first-season pup can therefore see at
  most ~20 hunts — the dog ages on the calendar, not on a grind.
- **Home region** **[built]**: chosen at career start (replaces the fixed Southern
  Plains home). The truck still gates travel at hunter lv 2 — it now reads
  as "you can afford trips". Trips are how a dog meets other species.
- **Species openers** **[built]** (true-ish to life): ruffed/woodcock/blue
  grouse Sept 1 · sharptail/huns/prairie chicken mid-Sept · chukar Oct 1 ·
  pheasant mid-Oct (the opener) · quail species Nov 1. All close end of
  January. Areas with nothing open are closed on the map ("opens Oct 12")
  — September means grouse trips, October the pheasant opener, December
  desert quail. The travel map becomes a season plan.
- **Young and educated birds** **[built]**: early season a share of each covey is
  young-of-year (hold ~1.3× longer, fly ~0.9× slower), decaying weekly;
  from December the survivors are educated (nerve ~0.8×, wilder flushes).
  Late-season roosters in the snow get exactly as hard as they should be.
- **Conditions follow the month** **[built]**: Sept leans hot, Oct frost, Nov
  frost/rain, Dec–Jan snow — crossed with the region's climate (the
  Sonoran stays mild in December). Replaces the flat per-area bias.
- **Dog aging** **[built]** (in seasons): season 1 growing (the XP arc carries it),
  ~2–7 prime, 8+ decline — speed/stamina drop a few % per season while
  the nose holds; an old dog gets slow, not dumb. Kennel shows it
  ("Chief · 9 seasons · slowing down"). The brace is the payoff: the old
  dog hunts alongside the pup coming up, honoring already models the
  manners lesson. Off-season = one transition screen; dogs age +1.
- **Open questions**: difficulty tiers (a "casual career" without the
  calendar) — deferred; one well-tuned career first, Quick Hunt is
  already the sandbox. Forced retirement vs indefinite decline — lean
  soft decline, no forced goodbye. Summer training camps as a later
  off-season activity.

## Meta layer **[built]**

- **Game modes** **[built]**: the title offers **Career** (raise your dog,
  work the map, everything below) and **Quick Hunt** — pick any breed, level
  1–10, covert, and wind; everything unlocked, nothing saved to the career.
  Last quick setup is remembered. Doubles as the permanent testing surface.
- Title screen, area select, career totals **[built]**.
- Continental-US travel map (`MapScene` → region area select) **[built]**:
  all 7 regions open (11 areas); home ground is free, the rest need the
  truck (hunter lv 2) — and the calendar decides what's in season.
- The 7 regions:
  North Woods (ruffed, woodcock) · Prairie Pothole (ringneck, sharptail, Huns,
  prairie chicken) · Southern Plains (bobwhite) · Sonoran
  Desert (Gambel's, scaled, Mearns) · Great Basin rimrock (chukar, Huns) ·
  High Rockies/Cascades (blue grouse, mountain quail) · Pacific Valleys
  (California quail).
- Career save: v2 localStorage with `version`, kennel (each dog's XP and
  born season), active dog + bracemate, hunter profile, home region, and
  the season date; v1 and pre-season v2 saves migrate. **[built]**
- First-run flow: breed select (stat bars) + puppy naming, then the kennel
  drives every hunt. **[built]**

## Progression & gear **[built]**

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
- Two-dog hunting **[built]**: mark a bracemate in the kennel (hunter lv 7)
  or pick a second dog in Quick Hunt. **Honoring**: a dog within ~150px of
  a packmate's point stops and backs (cool-blue tint) until it resolves —
  but rolls its steadiness once per point, and a soft young dog may *steal
  the point* instead, with all the bumping that invites. Honoring breaks
  off to retrieve. Work is credited per dog (points, retrieves, birds over
  the point) and each earns its own XP at the summary; the retrieve goes to
  whichever dog gets there first. The hen fine now docks the *hunter's* XP —
  he pulled the trigger, not the dog.

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
- **T5 — two dogs [shipped]**: brace selection in the kennel + Quick Hunt
  dog-2 row, honoring (with point-stealing by soft pups), per-dog XP
  credit, shared retrieves, per-dog arrows/minimap dots/HUD lines; hen
  fine moved to hunter XP.
- **T6 — fieldcraft [shipped]**: slope (the chukar uphill rule), per-hunt
  conditions with area climate bias + weather picker in Quick Hunt, hun
  circle-back, grouse timber screens, blocking runners, walk-in craft.
  Time of day stays planned. See Fieldcraft section.
- **T7 — seasons & time [shipped]**: the week-tick calendar (home hunts
  1wk, trips 2wk, wait-a-week / skip-to-the-opener), home region choice at
  career start, species openers closing areas on the map, young/educated
  birds across the season, month-driven conditions, dog aging (soft
  decline; retirement question deliberately open), off-season rollover.
- **Anytime**: PWA packaging **[built]** — manifest, home-screen icons
  (the bobwhite), and a stale-while-revalidate service worker (prod-only;
  updates land next launch); art pass (underway, see docs/ART.md);
  distance-scaled shot views (`flushDistance` already plumbed).

## Engineering rules

- `src/game/` stays pure TypeScript — no Phaser imports; unit-tested with
  Vitest. Scenes are thin rendering/input shells.
- New mechanics ship with tests and a playable build every commit.
- Tuning lives in named constants at the top of the relevant module.
