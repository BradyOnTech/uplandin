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

## Milestone 2: one flight system, short rises, honest exits (2026-10-09)

### What changed

- **Short rises** (`src/game/riseScore.ts`). The next wave may rise when every bird of the last one is down, past 40 m, or has had two seconds (`holdsSky`, `WAVE_MAX_GAP_MS`), after a 150–350 ms breath; the late sleeper waits 300–700 ms. A slow wave lets the clock run but never crowds the shot: no more than three live birds are ever inside 40 m, whatever their waves' clocks (`inTheShot`, locked by a test and measured in both tools). Never into an empty gun, except the sleeper, is unchanged. I took two seconds rather than the suggested 2.5–3: in the rise lab, 2.5 s puts 8-plus-bird chukar rises at 9.3 s, 2.0 s at 8.8 s.
- **One flight system** (`src/game/flightLine.ts`, pure, 19 tests). Every species flies a whole world-space line planned at launch and stepped on the fixed tick, from its family: bobwhite burst to head height, set their wings and glide for cover; a rooster claws almost straight up, hangs, levels and accelerates; sharptails climb, beat and glide, and bank through long curls; chukar pour off the slope holding their launch altitude, then swing across the draw; Huns go low and curve as a bunch. At launch the plan honours the wave lane and lane height, terrain clearance looking ahead, the chukar slope rule (0.82 / 1 / 1.15 of the speed, less climb from above), an escape-cover landing along the bird's own line, the sky behind it for its first second where the land allows, and the straightaway limit its wave gives it. `quailFlight.ts` and the 2D-translated ringneck and chukar path are gone; hit centres, the shot timeline, `hitReactions` and the close-flush package are unchanged.
- **Separation that holds.** The rise lab showed wave-mates lying on top of each other on screen for a third of the shot window: a bird turned off the gun's line of sight leaned whichever way it already leaned, often across onto a neighbour's line. It now turns away from its wave-mates. A popcorn single or pair rises on the far side of the line of sight from the birds already up (judged by where they are heading, not where they are), and a miss holds its own line through the shot window before turning for its cover, inside a 35° cone.
- **Honest exits.** The decorative sharptail departure is gone. A bird credited out of the shot (80 m or 15 s, as before) becomes a leaving bird: not shootable, not held, not retrievable, not a dog mark, holding nothing open. It flies its same line until it sets down in the cover it was credited with or leaves the screen (out of view, behind the land, under 2 px; 320 m or 25 s if no camera watches). A bird bound for cover is never cut for being small: it glides all the way in. Rooster, chukar and sharptail have landing lines of their own reach (90–170, 60–140 and 100–190 m); chukar and sharptail may also set down on open slope or prairie the hunter can see, since the whole hillside is their cover.
- **The eruption reads** (`src/three/coverEruption.ts`). Soft dust and straw over the whole footprint, sized to the covey: translucent puffs whose edges thin to nothing where they turn from the eye (a cloud, never a stone), lit as the ground under them is (so a puff against the sun is not dark smoke), thrown up in columns where each bird sat and rolling out low round the covey, drifting down the wind; light straw, seed and leaf flutter down through it. Two instanced draws while it lives (about 2.5 s); Lightweight throws fewer, larger pieces. No emissive, rim or glow: the shader only lowers opacity. The grass shake reaches over the whole burst.
- **Tools.** `tools3d/rise-lab.mjs` flies many rises per ground headless through the real subsystem over the real landform (seeded hunts, each covey walked up from a seeded bearing at 14–24 m) and reports the numbers below. `tools3d/review-rise.mjs --shoot` fires at the first bird of each wave 0.75 s after it rises (a hit) and at a wave-mate 0.5 s later (a miss), then reloads at the game's own pace (0.55 s + 0.38 s a shell); the review now also logs the most birds inside 40 m at once and names each exit.

### Numbers: the rise lab (after; 4 hunts x 6 coveys per ground, no shooting)

| Ground | Rises (birds) | Most live inside 40 m | Straightaways | Sky-backed, first second | Shot window: closest pair median / share of ticks >= 5° / least per rise, median | Rise length median / max / 8+ birds | Escapes set down / drove off |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quail Fields | 10 (52) | 3 | 27% | 54% | 25.0° / 97% / 11.4° | 6.8 / 8.0 / 8.0 s | 28 / 24 |
| Sharptail Prairie | 8 (32; 2 are Hun coveys) | 3 | 28% | 37% | 26.6° / 92% / 18.3° | 5.4 / 6.9 / – s | 12 / 20 |
| Pheasant Coverts | 19 (40) | 3 | 15% | 56% | 12.2° / 94% / 8.4° | 3.2 / 4.4 / – s | 13 / 27 |
| Chukar Ridge | 6 (32) | 3 | 13% | 3% | 16.5° / 95% / 4.9° | 6.6 / 8.8 / 8.8 s | 20 / 12 |

Straightaways are under 40% on every ground. Before the turn-away fix, the same lab read a 10.4° closest-pair median and 62% of shot-window ticks at 5° or more on Quail Fields.

### Numbers: the rise review (before `7841b5c` → after, same seed, 1440×810 High; Lightweight runs the same simulation)

No shooting:

| Ground (bird, covey) | Rise length | Waves at | Shot window min / median, share >= 5° | Sky-backed, first second | Straightaways | Live inside 40 m, max | Exits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quail Fields (bobwhite, 5 of 6) | 12.3 → **5.8 s** | 0/5.6/10.7 → 0/2.4/4.3 s | 19.7° / 22.3°, 100% → 17.6° / **28.7°**, 100% | 87% → 79% | 3/5 → 3/5 | 3 → 3 | range-out ×5 → left the screen ×5 |
| Sharptail Prairie (sharptail, 6) | 4.0 → 5.2 s | 0/0.9/3.3/4.0 → 0/1.8/2.7/3.6 s | 11.1° / 17.7°, 100% → 3.8° / **40.4°**, 91% | 21% → **55%** | 4/6 → **1/6** | 3 → 3 | decorative departures → left the screen ×4, set down in sight ×2 |
| Pheasant Coverts (ringneck) | 2.5 → 5.8 s (one rooster rose before, three after) | 0 → 0/1.4/3.6 s | – → 15.1° / 15.7° | 59% → 58% | 0/1 → 0/3 | 1 → 2 | left the screen ×3 |
| Chukar Ridge (chukar, 9 of 10) | 12.9 → **8.4 s** | 0/5.5/10.9 → 0/2.8/4.8/6.8 s | 1.8° / 15.2°, 93% → 1.4° / 16.0°, 88% | 90% → 86% | 0/9 → 0/9 | 3 → 3 | left the screen ×9 |

Shooting (`--shoot`):

| Ground | Rise length | Shot window min / median, share >= 5° | Sky-backed, first second | Shots (hits) |
| --- | --- | --- | --- | --- |
| Quail Fields | 6.9 → **5.2 s** | 19.7° / 22.3°, 100% → 17.6° / **46.9°**, 100% | 85% → 77% | 4 (3) |
| Sharptail Prairie | 4.1 → 4.4 s | 0.1° / 13.6°, 71% → **10.7° / 29.4°, 100%** | 18% → **49%** | 4 (2) → 4 (3) |
| Pheasant Coverts | 0.8 → 4.4 s (one rooster → three) | – | 50% → 49% | 1 (1) → 3 (3) |
| Chukar Ridge | 11.3 → **8.8 s** | 1.8° / 23.1°, 93% → 1.4° / 26.4°, 88% | 90% → 85% | 6 (3) |

The hunts to the point differ a little after the change (earlier rises settle at different times): the Chukar walk-in is 6.7 m after against 30.2 m before, and Pheasant Coverts puts up three roosters in a row after against one. Draw calls through the rise, High: Quail 246, Sharptail 140, Pheasant 183, Chukar 163 (before 246, 138, 182, 152); Lightweight Sharptail 86, Chukar 124 (before 83, 110).

Evidence (a before row, then after at 1440×810 High and 844×390 Lightweight; cyan ring against the sky, orange against the land, grey falling or leaving):
- `birds/quail-fields-rise-m2-before-after.jpg`, `birds/sharptail-prairie-rise-m2-before-after.jpg`, `birds/pheasant-coverts-rise-m2-before-after.jpg`, `birds/chukar-ridge-rise-m2-before-after.jpg` (0.25–3 s)
- `birds/quail-fields-rise-shooting-m2-before-after.jpg`, `birds/sharptail-prairie-rise-shooting-m2-before-after.jpg`, `birds/chukar-ridge-rise-shooting-m2-before-after.jpg` (0.5–4 s, with shots)
- `birds/covey-eruption-m2-before-after.jpg`: crops round the covey at 23.5 m (Quail) and 16.8 m (Sharptail), both tiers, at 0.25, 0.5 and 1 s.

Runs: `/tmp/uplandin-rise/m2-before`, `m2-before-shoot`, `m2-after`, `m2-after-shoot`, and the lab at `/tmp/uplandin-rise/lab-m2f.json`. The after captures were taken before merging the campaign's light and cover lanes. A spot check after merging their first milestones (Sharptail and Quail, Lightweight) gives identical rise numbers, and the dust still reads over the cover lane's new prairie grass; the light lane's second milestone came in after that and was verified by tests and tsc only.

Tests: 2,054 passing in 249 files on the merged tree (1,973 in 243 before the merge), tsc clean. New: `test/flightLine.test.ts` (19) and `test/coverEruption.test.ts` (4); `test/quailFlight.test.ts` is retired with its module; the sky rule, honest-exit and lane tests are extended.

### Self-assessment against the target

- **A short score per species.** Yes: a five-bird bobwhite rise is under 6 s, a nine-bird chukar rise 8.4 s, and the lab's 8-plus coveys finish in 8.0 s (Quail) and 8.8 s (Chukar) with no shooting. Shooting shortens Quail and Sharptail; on Chukar it lengthens the rise by 0.4 s, because the review's shooter empties the double at every wave and the gun rule waits for the 1.3 s reload.
- **The cover blowing out across the footprint.** Now visible at 17–24 m on both tiers as soft tan dust and pale straw over the whole covey, and plainly not stone. It is modest at 35 m on a phone (a cloud of roughly 30×12 px) and low in contrast over tan grass.
- **At most three in the sky, each on its own line.** Three live targets at most, measured in both tools. Separation is the best it has been: closest-pair medians of 12–27° in the lab, with 92–97% of shot-window ticks at 5° or more.
- **Crossing and quartering common, straightaways under 40%.** 13–28% per ground in the lab.
- **Against the sky for the first second where the land allows.** Quail 54% and Pheasant 56% in the lab. Sharptail 37% (swells behind low birds), though the capture went from 21% to 55%. Chukar 3% in the lab, where the seeded approach often stands the hunter level with or above a covey that pours off below his eye; 86% in the capture, where he is below them. The lift is capped per family (chukar 1 m) so chukar stay low along the slope.
- **Every exit honest.** No decorative departures. Every escape flies its own line until it sets down or leaves the frame, and a bird bound for cover finishes its glide.

### Open issues

- **Leaving birds on screen.** With honest exits a Sharptail or Chukar rise can show up to six birds at once: three live inside 40 m and up to three leaving beyond it, shrinking away over about three seconds. They cannot be shot and hold nothing back. Making leaving birds count against the cap would roughly double the rise length; that is the lead's call.
- **`WAVE_MAX_GAP_MS` is 2.0 s, not 2.5–3,** for the reason above.
- **Chukar sky-backing** depends on where the hunter stands. The lab's random approach is harsher than real hunting below chukar, but it is a real gap when walking the rim.
- **Far landings are tiny.** A chukar or sharptail setting down 150 m out glides in as a speck of 1–2 px on a phone. A mark cue belongs with the second act.
- **Quail landings are seldom seen in the capture**: sand plum blocks the hunter's sight lines, so most escapes drive off. The lab sets down 28 of 52.
- `docs/3d/world-and-birds.md` still lists `src/three/quailFlight.ts` in the lane table (the lead's file).
- Still open from M1: thunder frame time on a real phone, and the scattered-covey pacing sweep.

### Files touched outside lane ownership (M2)

- `docs/DESIGN.md`: the flush paragraph restates the sky rule (live targets, short waves, one planned line, honest exits).
- M1's list is unchanged: `src/audio.ts`, `src/game/huntSimulation.ts`, `tools3d/capture.mjs`.
