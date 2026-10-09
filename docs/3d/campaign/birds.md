# Birds lane log

Lane branch `lane/birds`. Target: "The birds: what done looks like" in `docs/3d/world-and-birds.md`. Evidence images live in `docs/3d/campaign/birds/`.

## Milestone 1: rise evidence, then waves are back (2026-10-08)

### The rise review

`tools3d/review-rise.mjs` (always run with `--url http://localhost:4611` under `tools3d/heavy.sh`) hunts each core ground from seed 7701 in capture mode. The hunter walks cover to cover, follows the dog when it works scent, and hunts any other species' points through; when the dog holds a point on the ground's own bird (bobwhite, sharptail, ringneck, chukar) he walks in under the flush law (`triggerFlush`). The camera stays at his eye where the walk-in ended, turned to the birds that rose with a slight upward gaze, and the whole field keeps running. Frames at fixed times go to `/tmp/uplandin-rise/<label>/` at 1440×810 High and 844×390 Lightweight (touch emulation), with telemetry per frame and per bird; `tools3d/rise-sheet.py` draws one sheet per ground (cyan ring: against the sky; orange: against the land; number: projected span in px).

Telemetry: birds in play (launching, flying, falling) and visible (also escaped sharptail silhouettes still departing); each bird's projected span, screen position, height and range; the angular separation between live birds from the gun, overall and in the shot window (both birds 0.5–2.5 s out of the cover); sky-backing (terrain plus standing-cover crown never rises above the line of sight beyond the bird; trees and far props are not sampled); the line from the gun at 0.8 s (straightaway < 25°, quartering < 65°, crossing < 115°, else incoming); and how each bird left (range-out, landed in its target cover, put down, fell, departed).

The old `the-rise` / `rise-wide` / `debug-burst` compositions in `tools3d/capture.mjs` are retired: their "walk until an 8-bird covey" loop walked the hunter about 4.4 km off the property.

### What changed

- **Waves in 3D** (`src/game/riseScore.ts`, `src/three/subsystems/birds.ts`). The `spatialEncounter` whole-queue launch is gone. Each covey is planned at the flush: nearest the boots first, waves of three (bobwhite, Hun, chukar), seeded singles and pairs for sharptails (popcorn: the next small wave lifts while others are up, a beat apart), one at a time for pheasants, and an 18% sleeper held to the end (Hun 14%, chukar 20%, sharptail 22%). All coveys share one cap of three birds in the air. A covey wave rises once the sky has been clear for a breath (350–700 ms), or as soon as it fits after the gun has been fired dry and reloaded; it never rises into an empty or reloading gun until the hunter has had 2.4 s past the breath to reload. The sleeper gets up when the gun is empty (at least 450 ms after the last wave), or 1.1–2 s after the sky clears if the hunter never empties it.
- **The covey is still heard and seen breaking.** At the flush every bird held for a later wave blows its cover out where it sits, and one synthesised wing thunder (`synthesizeCoveyThunder`, `playCoveyThunder`) sized to those held birds sounds from their cover: up to four voices, loudness growing with the square root of the birds and the stagger widening, so twelve plainly outweigh five. The first wave's birds burst and sound for themselves.
- **Wave-mates fly their own lines.** Each wave gets distinct lanes (bobwhite and sharptail 0.55 rad apart, chukar 0.5, Hun 0.4), spaced by how fast each bird crosses the shooter's view rather than by raw bearing, handed to the birds left to right as the gun sees them so lines open instead of crossing, and split in height (middle lane climbs 1.3×, sides 0.8×; a pair high and low). A bobwhite picks its escape cover along its own lane. Chukar (still on the translated path) get their lane as a lateral impulse at full authority from the cover. A lone bird breaks to one side.
- **The simulation contract.** A queued bird is `flushed` in the simulation and sits in the cover: never drawn, never a target (`pickBirdAlongRay` only takes flying slots, a queued bird has none), never in the bag or the escaped tally; a steady dog keeps marking while any of its birds is still flushed; the rise settles (`finishRise`, doubles, relights) only when nothing is queued or in the air. Held singles (`heldSingles`) stay hidden as before and are a different thing.
- **A scattered covey rises in pieces.** In the continuous field, a covey that is not held together on the ground (chukar, sharptail, Hun; not bobwhite) flushes only the members chained within 25 yd of the bird that broke (`COVEY_BOND_YD`). The rest hold where they ran to and flush later as their own piece, from their own spots.
- `DESIGN.md`'s pillar now says the wave rule governs both views (restored by Brady's delegation).

### Numbers

Before is the build at `249add0`; after is this milestone. Same seed, same tool; the hunt to the point differs slightly after the change because earlier, passed-over rises settle at different times.

Per ground, 1440×810 High (844×390 Lightweight runs the same simulation and gives the same numbers; only the frames differ). "Shot window separation" is the angle between live birds from the gun while both are 0.5–2.5 s out of the cover (before: read off the frames, so approximate). Lines are per bird at 0.8 s.

| Ground (bird, covey) | In the air, max | Shot-window separation, min / median | ≥ 5° apart | Sky-backed, first second | Straightaways | Rise over |
| --- | --- | --- | --- | --- | --- | --- |
| Quail Fields (bobwhite, 5 of 6 flushed) | 5 → **3** | 1.4° / 2.4° → **19.7° / 22.3°** | 0% → **100%** | 87% → 87% | 2/5 → 3/5 | 5.1 s → 14.9 s |
| Sharptail Prairie (sharptail, 6) | 6 → **3** (6 visible counting escaped silhouettes past 80 m) | 1.0° / 2.1° → **11.1° / 17.7°** | 0% → **100%** | 23% → 21% | 5/6 → 4/6 | 3.0 s → 6.0 s |
| Pheasant Coverts (rooster, alone) | 2 → 1 | – | – | 47% → 59% | 1/2 → 0/1 | 6.8 s → 5.0 s |
| Chukar Ridge (chukar, 9 of 10 flushed) | 9 → **3** | 0.2° / 0.4° → **1.8° / 15.2°** | 0% → **93%** | 88% → 90% | 1/9 → 0/9 (4 crossing, 5 quartering) | 4.9 s → 15.0 s |

Across the four rises, straightaways fall from 9 of 22 birds (41%) to 7 of 21 (33%). Projected span at 1 s is unchanged (bobwhite 16–23 px at 1440×810, 8–11 px at 844×390). Draw calls per frame through the rise, after: Quail 246–259, Sharptail 146–159, Pheasant 182–188, Chukar 152–165 (High); each airborne bird costs 3–5 draws, so a rise now holds at most 9–15 bird draws where the nine-bird chukar burst held 27–45. No bird blinks out on the ground any more on Chukar Ridge: a first try that slid chukar lanes toward the gun turned three of nine into the hill at 1.2 s, and the wave is now turned to pour off on or below the contour (`lanesOffTheHill`, locked by a test).

Evidence (each a before row, then after at 1440×810 High and 844×390 Lightweight, 0.5–3 s; cyan ring against the sky, orange against the land):
- `birds/quail-fields-rise-before-after.jpg`
- `birds/sharptail-prairie-rise-before-after.jpg`
- `birds/pheasant-coverts-rise-before-after.jpg`
- `birds/chukar-ridge-rise-before-after.jpg`

Full strips and telemetry are regenerable with the tool; the runs behind these numbers are in `/tmp/uplandin-rise/before` and `/tmp/uplandin-rise/after` on this machine.

Tests: 1,955 passing in 242 files, 25 of them new (the rise score, the sky rule in the presentation, the queued-bird contract in the simulation, the scattered covey, the thunder); the whole-covey test in `test/continuousCovey.test.ts` and five others that assumed it are rewritten to lock the wave rule. tsc clean.

### Self-assessment against the target

- **Does each rise still feel like a covey breaking?** Partly. The first wave of three goes together from the cover inside a fifth of a second, and at the flush every held bird throws its cover where it sits while one thunder sized to them sounds from there. In motion and with sound that should read as the whole covey going; in stills it reads as three birds and a puff, because the debris of birds 20 m or more away is a few pixels. The cover eruption needs to be bigger and readable at the range points actually happen; that is a gap.
- **Are first-wave birds clean, readable, separated targets?** Separated, yes: from 0–2° to 15–22° median from the gun, on their own lines and heights. Clean against the sky on Quail and Chukar (87–90% of first-second frames); not on Sharptail, where they lift low over a rising swell (21%). Readable at range, not yet: a bobwhite is 16–23 px at 1440×810 and 8–11 px on an 844×390 phone, a speck in a fixed view (campaign 2 territory).
- **The cost of waves is time.** A five-bird bobwhite rise now runs 15 s instead of 5, a nine-bird chukar rise 15 s, because a wave waits until the last bird of the one before has landed or gone 80 m. Shooting shortens it (a falling bird clears in a second or two), and the gun rule only ever holds a wave back for a hunter who has not reloaded. It is the Duck Hunt rhythm the rule asks for, but it should be felt in play before it is called right.

### Open issues

- Escaped sharptail silhouettes (the decorative departure past 80 m, up to 6 s) are not counted in the cap, so a sharptail rise can show up to six birds in the sky, three of them far specks. Counting them would stretch a six-bird rise past 20 s; the fix belongs with honest exits (M5) or the one flight system (M2): a bird that has left the shooting envelope should leave the frame or set down, not linger.
- Sky-backing on Sharptail Prairie (21%) and the bobwhite straightaway share (3 of 5) are line-family problems: lanes spread birds but every line still starts as a low burst away from the gun. M4's sky-backing and crossing constraints are the remedy.
- The cover eruption is too small to read at 20–30 m (see above).
- The capture never fires the gun, so the gun-timed paths (empty gun holds a wave, a reload lifts one, the sleeper into an empty gun) are proven by unit tests only. A shooting capture is worth adding when M2 lands.
- The thunder is synthesised from up to four voices at the flush frame (shortened to 0.6 s each); worth a frame-time check on a real phone.
- The scattered-covey rule changes how many points a chukar, Hun or sharptail covey gives: fragments beyond 25 yd become later encounters. Pacing has not been swept; the Landform lane's hunt lab is the right place to measure it.
