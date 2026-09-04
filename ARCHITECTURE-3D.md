# Uplandin 3D — Engine Contract

Branch `3d` remakes Uplandin's presentation in first-person Three.js.
The simulation (`src/game/` — dog AI, birds, seasons, careers, 213 tests)
is **untouched and authoritative**: the 3D layer consumes `HuntState`
exactly as the 2D `FieldScene` did. We are re-rendering the game, not
remaking it. `main` + tag `2d-checkpoint` hold the complete 2D game.

## Art direction (LAW)

**Firewatch / A Short Hike stylization. Never realism.** Flat-shaded,
simple forms, strong silhouettes, zero photo textures — color does the
work, and every color comes from `src/three/palette.ts` (the locked 2D
palette carried into 3D). Chasing realism with procedural assets lands in
the uncanny 5/10 zone (see Claude-of-Duty's own scorecard); stylization
is a choice that reads as one. October light: dawn and evening are the
hero times of day; `lastlight` is legal shooting's amber edge.

## The quality loop (how "AAA" is enforced)

Every visual subsystem iterates under critique until it survives a blind
side-by-side against real Firewatch / A Short Hike stills
(`docs/3d/reference/`). The loop:

1. Builder agent implements/refines its subsystem (its directory ONLY).
2. `npm run build:3d` must pass; `node tools3d/capture.mjs` must produce
   the shot set (both are hard gates — a broken boot blocks everything).
3. Critic agents (separate, harsh, no authorship stake) judge the shots
   against the reference stills: blind A/B ("which frame is better?"),
   1–10 scores on palette discipline, silhouette readability, lighting
   mood, artifact hunt (z-fighting, shadow acne, LOD pops, banding).
4. Verdict < threshold → concrete fix list → builder goes again.

Critics compare against the *actual games'* stills, not descriptions.
A subsystem is done when the critic would hesitate in the blind A/B.

## Subsystem rules (adopted from what worked in Claude-of-Duty)

- One subsystem = one file/dir under `src/three/subsystems/`. You own
  your directory; never edit outside it.
- **Never import another subsystem's module.** Use `ctx.get(id)` at
  runtime (typed) or `ctx.events`. Exception: everyone may import
  `palette.ts`, `engine.ts` types, and `src/game/*` (the sim).
- Deterministic randomness only — and **per-subsystem streams**: seed a
  local `mulberry32(FIXED_SEED)` inside your subsystem instead of drawing
  from the shared `ctx.rng` for placement. (Round-2 lesson: one agent
  changing its draw count re-rolled every other subsystem's placement and
  broke framed compositions.) `ctx.rng` remains for genuinely shared
  choices; never `Math.random()`.
- **Allocate nothing per frame.** Preallocate vectors/colors; reuse.
- `dispose()` releases every GPU resource you created.
- The sim is read-only to presentation subsystems. Intent flows through
  the same call surfaces FieldScene used (`createHunt`, `dog.update`,
  `flushCovey`, …).

## Planned subsystems

| id | owns | status |
|---|---|---|
| sky | dome, sun, hemisphere, fog, time-of-day | scaffold |
| terrain | heightfield, ground coloring, heightAt() | scaffold |
| player | FP controls, walk, capture poses | scaffold |
| grass | instanced wind-swayed cover + open field | — |
| flora | trees, shrubs, cattails, deadfall props | — |
| props | authored Kenney CC0 heroes (quail-fields), normalized at load | live |
| dog | segmented low-poly dog, sim-driven animation | — |
| birds | covey rises in 3D, species silhouettes | — |
| gun | viewmodel, mount/swing, spread, recoil | — |
| hud | pixel-font-carried UI, minimap, prompts | — |
| audio | Web Audio synthesis (port 2D patterns) | — |
| fx | feathers, dust, muzzle, weather particles | — |

## Performance budgets (mobile is a constraint, not a port)

Desktop (`quality=high`): 60 fps at 1080p DPR≤2 on Apple Silicon.
Mobile (`quality=lite`): 30 fps target — DPR≤1.5, no antialias,
shadow map ≤1024, grass instance count halved, post-processing OFF by
default everywhere (tone mapping only). Every subsystem implements both
tiers from day one; a feature that only works on `high` is unfinished.

Budgets: ≤300 draw calls, ≤1.5M triangles on screen, zero per-frame
allocations (verify with three.js `renderer.info` in capture output).

## Units & mapping

1 sim px ≈ 1 yard ≈ 0.91 m. `SHOT_RANGE 40` is a literal 40-yard gun.
Area-map positions are stable property coordinates. `LandscapeModel` is the
single mapping seam between those shared pixels and hunt-local world meters:
the selected drop stays at the render anchor, while every elevation sample
continues to address the same named property. Cover patches drive grass
density; `heightAtProperty()` is the renderer-neutral elevation query and the
terrain subsystem exposes its world-space `heightAt(x, z)` adapter.

## Gates (run before every commit)

```bash
npm test              # sim stays green — 213 tests, untouched
npm run build:3d      # tsc + vite build of both entries
node tools3d/capture.mjs   # every shot renders
```
