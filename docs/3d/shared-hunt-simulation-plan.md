# Shared hunt simulation consolidation

## Checkpoint status — implemented

The shared seam now exists at `src/game/huntSimulation.ts` and both
`FieldScene` and `Hunt3DSystem` use it. It owns:

- bird and dog update ordering
- cover, wind, weather, recall and packmate-honor inputs
- dog bumps, birds scenting the dog, sprint spooks and pointed-bird nerve
- proximity flushes, point credit and dog steadiness on the rise
- retrieve credit plus authoritative downed/escaped shot outcomes
- rendered-fall coordinates written back before shared retrieve behavior
- rise finalization: doubles, downed-over-point credit and survivor relights

The 2D `FlushScene` and the open-world 3D gun both resolve birds through the
same simulation instance and call `finishRise()` for the same scoring and
relight rules. Hunt completion is derived from shared bird state. The 3D
adapter now presents that outcome with a live hunt HUD and summary overlay;
the 2D adapter retains its Phaser scene transition.

## 3D shooting decision

Keep the 3D shot in the open world. A hard cut to a shooting gallery would
discard the spatial payoff of finding the dog, reading its point, choosing a
walk-in and facing the actual cover. The 3D adapter therefore keeps the
camera free while the shared field simulation holds its breath, launches the
existing limited-wave covey rise in world space, and uses a camera-centered
shotgun pattern:

- right mouse mounts the gun
- a contextual reticle appears during the rise
- left mouse fires, honoring shared shell count, cooldown and spread
- hits fold the rendered bird and mark the shared bird downed
- birds leaving the rise resolve escaped through the shared simulation
- hit birds shed a brief feather burst, fall, and remain grounded
- the dog enters the shared retrieve behavior after the rise; the grounded
  render disappears only when the shared bird becomes `retrieved`
- a live HUD reports hidden birds, bag, losses, rise/shell status and retrieve
  state, followed by a career-aware end-of-hunt summary
- sprint pressure, whistle/gear reach, early end-hunt, and two-dog braces use
  the same shared inputs and work tallies as 2D

The 2D adapter keeps its scene cut because that presentation is purpose-built
for a readable 480×270 shooting gallery. The rule outcome is shared; the
camera language is intentionally adapter-specific.

## Recommendation

Consolidate now, while the 3D presentation is playable and before more hunt
rules accumulate in its bridge. Do **not** copy or "port" the 2D rules into a
second implementation. Extract their orchestration into one deep gameplay
module and keep Phaser and Three.js as adapters at the presentation seam.

## What is already shared

The 3D hunt correctly reuses substantial 2D gameplay code today:

- `createHunt()` and `HuntState`
- `Dog.update()` including breed, cover, wind, stamina, scent, point, creep,
  retrieve, recall, honor and the staged search-to-point sequence
- `updateBirds()` and the shared bird/species data
- weather and wind multipliers
- shot/flight math used by the 3D covey-rise presentation

The original live bird-finding bug was a world-adapter error. It is now fixed
structurally: the selected shared drop point is pinned to the 3D camera, all
cover/landmarks retain their relative coordinates, and the same mapped entry
cover supplies the opening covey in both renderers.

## Original gap assessment

Before this extraction, `FieldScene` orchestrated gameplay rules that
`Hunt3DSystem` either duplicated partially or did not run:

- dog bump detection and the resulting covey flush
- birds scenting an inexperienced dog
- pointed-bird nerve and wild flushes
- point/retrieve work tallies and progression credit
- packmate honoring inputs
- whistle/recall input and tracking-gear rules
- flush cause and point-credit bookkeeping
- hunt-complete lifecycle and summary transition
- the full shot, fall, retrieve and relight lifecycle

All gameplay items in that list now sit behind the shared seam. The only
adapter-owned pieces are intentionally visual: shot selection, bird flight and
fall rendering, HUD layout, audio, and the final screen/overlay transition.

## Module interface

`src/game/huntSimulation.ts` exposes one deep module with a small interface:

```ts
const sim = new HuntSimulation(config);
const events = sim.update(dtMs, input);
sim.resolveBird(birdId, 'downed');
const resolution = sim.finishRise();
```

`input` contains player intent and world facts only: hunter position, running,
recall, whistle range, and adapter-scale dog movement. `update()` owns ordering
and returns domain events:

- `dog-pointed`
- `covey-flushed` with cause, distance and point credit
- `bird-retrieved`

Shot adapters call `resolveBird()` with a selected bird and outcome, then call
`finishRise()` after the presentation has resolved every bird in that rise.
Spatial hit-testing remains presentation-specific. `finishRise()` returns the
downed, escaped and relit IDs plus double and pointing-dog credit, so neither
renderer owns hunt scoring rules.

The adapters then stay thin:

- `FieldScene`: Phaser input, sprites, sound, UI and scene transitions
- `Hunt3DSystem`: camera/world-coordinate adapter and Three.js presentation
- `BirdsSystem`: presentation of a shared `covey-flushed` event
- `DogSystem`: presentation of the shared dog snapshot

## Migration order

1. Characterize the current `FieldScene` tick order and emitted outcomes.
2. Extract dog/bird update, bump, scent, nerve and flush orchestration without
   changing behavior.
3. Switch `FieldScene` to the shared module and keep its tests green.
4. Switch `Hunt3DSystem` from its partial tick to the same module.
5. Add recall, scoring, shot/fall/retrieve and completion inputs incrementally.
6. Keep world mapping in the 3D adapter; it is presentation geometry, not hunt
   law.

This sequencing preserves a working game throughout the pass and turns every
future breed or hunting-rule improvement into one implementation consumed by
both presentations.
