# Uplandin — Tuning Guide

Every gameplay number lives in a named constant near the top of its module,
or in a data table (species, breeds, guns, conditions). This is the map.
Change a knob → `npm test` (the suite pins the *relationships*, not exact
values, so honest tuning rarely breaks it) → try it in **Quick Hunt**,
which can stage any breed/level/covert/wind/weather/gun/gear instantly.

Two laws worth re-reading before tuning (from docs/DESIGN.md):

- **Realism runs the field; Duck Hunt runs the sky.** Field-view knobs may
  chase truth. Flush-view knobs must chase fun and readability.
- **Skill loads the dice, it never replaces them.** Player skill should
  shift distributions, not collapse them.

---

## The flush pipeline (how one rise is computed)

When a covey flushes in range, `FieldScene.flush()` starts `FlushScene`,
which builds the rise in this order — each stage has its own knobs:

1. **Walk-in quality → rise difficulty.** `flushBias(flushDistance)`
   [shot.ts] maps hunter→bird distance (8px point-blank … 40px max) onto
   the per-bird size/depth range. Then the wild-card roll:
   `WILD_RISE_CHANCE` (0.18) makes the rise behave edge-of-range no matter
   what ("they're wild!" in the HUD, hotter speed rolls);
   `GIFT_RISE_CHANCE` (0.08) makes it sit tight no matter what (silent).
2. **Waves.** Up to `MAX_AIRBORNE` (3) birds burst *simultaneously*; the
   next wave rises when the sky is clear and `LAUNCH_GAP_MS` (300) has
   passed. Lanes are `WAVE_SLOT_SPREAD` (78px) apart, shuffled per wave,
   nudged by field position (±55 max) and jitter (±16). ~18% of birds are
   **sleepers** (`launchDelayMs` 350–900ms): they pop after their wave.
3. **Per-bird velocity.** `escapeVelocityFan` [shot.ts] slices the
   species' escape arc per lane (arc width from `flight.climb`), adds
   `FAN_SPREAD_PUSH` (24px/s per slot) so even steep climbers separate,
   then FlushScene applies: speed roll (0.85–1.3×; wild rises 0.95–1.4×),
   the per-flush break direction (`flushDrift`, ±28px/s), slope mults
   [fieldcraft.ts], and young-bird mult (`YOUNG_FLIGHT_MULT` 0.9).
4. **Flight phases.** After `flight.glideAfterMs` a bird locks wings
   (frame 1) and glides; after `flight.levelAfterMs` a rooster levels and
   accelerates. Both call the exit-drive steps [shot.ts]: `GLIDE_SINK`
   (18), `GLIDE_ACCEL`/`GLIDE_MAX` (130/150), `LEVEL_ACCEL`/`LEVEL_MAX`
   (150/210). **The tilted playfield: every bird always accelerates
   toward a screen exit. Never let a knob change break this.**
5. **Presentation.** Species `size` × altitude shrink (655px falloff,
   floor 0.55) × per-bird `depthBias` (range from stage 1). Ground
   shadows (alt falloff 300px), wobble (`flight.wobble` × per-bird
   0.6–1.6), flap anim at `flight.flapRate`. Depth ladder at the top of
   FlushScene.ts — birds must stay under timber (220) and all UI (280+).
6. **Resolution.** Hits spend a shell (gun `cooldownMs` gates the next),
   spawn feathers, fold sheet-birds to frame 2. Escapees roll
   `RELIGHT_CHANCE` (0.65) [birds.ts]: survivors land in a cover patch
   70–420px away (or a 140–420px random put-down in the open), nerve
   ×`SINGLE_NERVE_MULT` (1.7), covey bond broken; a single never relights
   twice. Hun coveys wild-flushed *out of range* instead `circleBack`
   once (150–300px, together).

## Flush-view knobs (FlushScene.ts + shot.ts)

| Knob | Value | Feel when raised |
|---|---|---|
| `MAX_AIRBORNE` | 3 | busier sky, less readable |
| `LAUNCH_GAP_MS` | 300 | longer breath between waves |
| `WAVE_SLOT_SPREAD` | 78 | wider lanes, easier to isolate a bird |
| `WILD_RISE_CHANCE` | 0.18 | more heartbreak on good points |
| `GIFT_RISE_CHANCE` | 0.08 | more mercy on scrambles |
| `FAN_SPREAD_PUSH` | 24 | faster lateral separation |
| `GLIDE_*` / `LEVEL_*` | see shot.ts | how fast escapees clear the screen |
| speed roll (inline, stage 3) | 0.85–1.3× | overall target speed variance |
| sleeper chance/delay (inline) | 0.18 / 350–900ms | more/later stragglers |
| `SHELLS`/spread/cooldown | guns.ts table | per-gun difficulty |
| `TOUCH_AIM_OFFSET` | 56 | crosshair height above finger (mobile) |
| `GUN_SWAY_X` / `GUN_LEAN_MAX` | 0.22 / 6° | how alive the held gun feels (gunAim.ts — sway, never swing) |
| `RECOIL_KICK_PX` / `RECOIL_MS` | 7 / 150 | how hard the shot lands in the hand |
| `GROUND_Y` | 205 | horizon of the shooting gallery |

Species character (all in **species.ts**, per species): `size` (0.62 quail
speck … 1.15 rooster barn door), `flight.speedMin/Max`, `climb` (arc
steepness — also narrows the fan), `wobble`, `flapRate`, `glideAfterMs`
(quail family + sharptail/hun/chicken), `levelAfterMs` (ringneck only),
plus `henRule`, `sound`, `timber` (grouse fly behind trees).

## Field-view knobs (FieldScene.ts)

`HUNTER_SPEED` 55 · `SPRINT_MULT` 2 · `SPRINT_SPOOK_RADIUS` 30 (sprint
flushes birds underfoot) · `SPRINT_NERVE_MULT` 1.6 · `FLUSH_RADIUS` 22
(walk-in trigger) · `SHOT_RANGE` 40 (wild flushes beyond this escape — and
it's the denominator of `flushBias`!) · `HEN_FINE_XP` 4 · bell/beeper
cadence + `BELL_HEARING` 700 · double-tap timing.

## The dog (dog.ts base constants × breeds.ts multipliers)

Base: `DOG_SPEED` 75, `TRACKING_SPEED` 90, `SCENT_RADIUS` 45,
`POINT_RANGE` 12, `QUARTER_RANGE` 130 (×Range stat = leash), `WHISTLE_RANGE`
250, `HONOR_SIGHT` 150, plus private creep/break/retrieve timings inline.

**Cover work** — the dog hunts objectives, not open ground: it casts to the
nearest unchecked cover patch inside its leash of the hunter
(`CAST_SPEED_MULT` 1.15), works it until it judges it checked, remembers
it (`COVER_REVISIT_MS` 50s), and moves to the next; only a covert with
nothing left to check gets the old open sweep. Working time = patch area ×
`COVER_WORK_MS_PER_PX2` (0.9), clamped `COVER_WORK_MIN/MAX_MS` (2.2s/10s),
× `coverThoroughness(level)` (0.62 at lv1 → 1.25 at lv10 — **a pup pops
out of cover early and leaves birds behind; that's the point**), × ±15%
noise.

**Edge work** — `coverEdgeFraction(level)` (0 at lv1 → ~0.45 at lv10)
spends that share of the work budget on the **perimeter** first
(`COVER_EDGE_LAP_RATE` 0.35 laps/s via `perimeterPoint`), then the interior
serpentine comb. Finished dogs ring the edge (where runners hold); pups
dive the middle. Raise the fraction for more methodical edge craft.

**Wind-aware cast** — `castAimPoint(patch, windAngle, windCraftTier)`:
tier 0 or calm → patch center; tier ≥1 with wind → a point on the
**downwind** side so the dog approaches leeward and works into the wind.
Does not change scent math — only the cast approach.

**Presentation gait** — `Dog.gait` (`run` / `trot` / `track` / `still`) and
`scentCheck` are set each tick for FieldScene only. Cast → trot; open work /
edge → run; tracking → track (faster FPS); first scent freezes ~320ms
(`scentCheck`). Winded multiplies FPS ×0.55 and applies a dusty tint.

**End hunt** — `endHuntEarly(hunt)` marks every `hidden`/`flushed` bird
`escaped` and increments `hunt.escaped`; FieldScene **end hunt** button
(top-right) + **E** / **Esc**. Summary uses the normal XP path.

**Hunter scale** — `HUNTER_SHEET_SCALE` 1.45 (setter sheet is wider; scale
balances on-screen weight).

**Flush backdrops** — `FLUSH_BACKDROP_POOLS[region]` arrays; index via
`pickBackdropIndex(pool, seed)`. Mid-ground brush: `flushHasVegBlock(seed)`
~40%, blocks pattern like timber (`thwack — brush!`).

**Shotgun (v3, FPS-natural)** — `gunAim.ts`. The sprite is authored in
perspective (from behind, DOOM-style: big stock/hand, barrels converging
to a small far muzzle), so the pose **sways, never swings**: the anchor
translates with aim X (`GUN_SWAY_X`, leashed by `GUN_SWAY_MAX`), lean is
capped at `GUN_LEAN_MAX` (6°), mount rises `GUN_REST.y → GUN_MOUNT_Y`
with lag, and each shot applies `recoilOffset` (kick + tilt easing out
over `RECOIL_MS`) plus a muzzle flash at `GUN_MUZZLE_OFFSET`. The muzzle
tops out near the horizon — the upper sky belongs to the birds. Painted
replacement: `art/shotgun-fp-v3.png` (spec in ART.md).

breeds.ts owns the formulas: `statMult` (1–5 star → 0.9–1.3×), growth
(+5%/lvl strong axes, +3% others, cap +40%), nose maturity (0.7+0.03/lvl),
`creepChance`/`breakChance` (steadiness+level → puppy mistakes; break
chance also = the *fails-to-honor* chance), `pointPressure` (0.6 vet …
1.45 pup nerve drain), `windCraftTier` (levels 1-3/4-7/8+), `staminaMs`
(90s base), dog XP curve `20 × level^1.5`. Age curve: `ageMult` in
**season.ts** (0.95 first season, 1.0 prime 2–7, −7%/season from 8, floor
0.55 — soft decline, never forced retirement).

## Birds on the ground (birds.ts)

Runners: `RUNNER_FLEE_RADIUS` 35, `RUNNER_SPEED` 42 (× species
`runSpeedMult` — chukar 1.3, scalies 1.25), energy/rest 2500/2600ms,
`RUNNER_NERVE_FACTOR` 0.7. Runners hold at their cover's edge (blocking)
and angle uphill on slopes (`SLOPE_RUN_BIAS` 0.55). Singles: see pipeline
stage 6. Young birds: `YOUNG_NERVE_MULT` 1.3, `YOUNG_FLIGHT_MULT` 0.9,
run half as often; share by week in **season.ts** (`youngShare`: 45% →
0 by week 13; `educatedNerveMult`: →0.8 by January).

## Conditions, wind, fieldcraft (tables)

**wind.ts**: calm/breezy/strong → scent ×1/1.1/1.25, nerve ×1/0.92/0.8,
dog-scent ×1/1.15/1.3. **conditions.ts**: frost (scent 1.15, nerve 1.25),
hot (scent 0.75, stamina drain 1.5), rain (scent 0.6, nerve 1.3, search
1.4), snow (nerve 1.3, search 0.6); roll bands + 45% area climate bias in
`rollCondition`; month→bias in season.ts `seasonalBias`.
**fieldcraft.ts**: slope approach ±0.35 dot → nerve ×0.6 above / ×1.4
below, flight ×0.82/×1.15; `FLANK_NERVE_MULT` 0.75.

## Season & progression

**season.ts**: `SEASON_WEEKS` 22, `HOME_HUNT_WEEKS` 1 / `TRIP_HUNT_WEEKS`
2 (the anti-grind — a pup sees ≤ ~20 hunts a season), species `OPENERS`
table (grouse wk0 → pheasant wk6 → quail wk9 → Mearns wk13).
**progression.ts**: hunter XP `10 × level^1.5`; unlock ladder — truck L2,
semi-auto+beeper L3, dog box L4, over/under L5, GPS L6, big box+brace L7,
side-by-side L8, GPS+map L9. Hunter XP events (FieldScene summary): bird
+1, double +1, hunt +2, hen −`HEN_FINE_XP`. **guns.ts**: the
shells/cooldown/spread table. Stocking: `areaBirdCount` (areas.ts) =
world px² / 100k × per-area `stocking`.

## Recipes

- **Flushes feel too hard/easy overall** → gun `spread` (guns.ts), speed
  roll range (FlushScene stage 3), species `speedMin/Max`.
- **Too much/little heartbreak** → `WILD_RISE_CHANCE` / `GIFT_RISE_CHANCE`.
- **Singles too scarce/common** → `RELIGHT_CHANCE`, scatter distances.
- **Dog blows up too many coveys (career)** → nerve ranges (species),
  `pointPressure`/`creepChance` curves (breeds.ts), or just level up.
- **Season too short/grindy** → `SEASON_WEEKS`, hunt week costs, XP curves.
- **Birds vanish too fast in the shot view** → `GLIDE_MAX`/`LEVEL_MAX`
  down, or species `speedMax` — but keep the tilted playfield: they must
  always be leaving.
