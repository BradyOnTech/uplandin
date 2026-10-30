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

## Milestone 3: falls and marks, the second act (2026-10-30)

Branch `feat/birds-marks-second-act`, cut from the campaign head `957f40a` with `lane/birds` merged in.

### The merge

`lane/birds` (`b6b0ba3`, `4894a7a`, `09c5e2e`) merged into the campaign head without a textual conflict: git combined the Landform lane's changes to `hunt3d.ts` and this lane's to `birds.ts` on its own. Two conflicts of intent did not show up as text. Both are resolved in `b3c0ac3`:
- **A miss beside the rimrock, never in it.** This lane's escape landings reached the simulation without the Landform lane's move off the rock. A bird that touches the slope early against a rim, or a Hun covey that circles back onto one, is now moved beside the rock, as a fall is (`hunt3d.resolveBird`, `openPropertyNear`). A relit single never sits where the dog cannot reach it.
- **The landing check on the canyon.** `landable` walked every collision circle for every candidate landing, and the canyon has 1,435 rim blocks. The circles are now indexed (`ObstacleIndex`, 16 m cells). The rock is read from the land itself (`hunt3d.rockAtWorld`), so headless hunts know it too.

### What changed

**Falls** (the lane's code half, `b6b0ba3`, with its evidence now). The wings collapse over 140 ms from where the shot found them, and the bird tumbles balled up. A puff of its own feathers is sized for the range (every feather at least 3 px on the screen it is drawn on). Dead weight bounces once off hard ground, swishes into cattails or heavy reeds, or splashes into a slough. A synthesised thump, swish or splash sounds from where it fell, delayed by its distance at 343 m/s. A wing-tipped bird that comes down alive runs on striding legs. Capture builds log each hit's feather size and each strike's thump delay (`__riseAudit.hits()`, `strikes()`).

**Marks: the second act** (`cfadf7d`, `53a76eb`, `src/game/marks.ts`).
- A miss the hunter watched go in is marked. Watched means three things at some moment in the 2.5 s before it touched down:
  - it was in his view: the camera's frustum, with a little margin for the corner of his eye;
  - it was within 250 m;
  - neither the land nor the crown of the standing cover was between his eye and the bird. The crown comes from the cover system's own sampler; on Quail Fields, from the sand plum runs the thickets grow on; elsewhere, 0.4 m of grass.
- If he saw it to the ground, the mark is where it landed. If the cover hid the last of it, the mark is where its glide was taking it: carried on along its line by its height at the rate it was sinking, at most 30 m (`glideMark`). That is how an eye reads a bobwhite setting its wings into a plum thicket.
- Only a bird the field keeps is marked (`landingHolds`, the simulation's own relight rule). A relit single's last escape never is. Birds down within 30 m of each other share a mark.
- A mark settles when its birds rise again, or when the rise settles and the field did not keep them. It fades from memory over four minutes.
- **The HUD.**
  - A callout, as a partner would say it: "2 birds marked down in Sage Draw · 110 yd". It says "marked going in" when the cover hid the last of the bird, and "Covey" for a Hun circle-back.
  - A MARK arrow and yards in the beacon row, beside TRUCK and WIND. On a phone, where TRUCK is hidden, it sits beside WIND. It dims as the mark fades.
  - For 30 s the guidance line says "Face your mark and press C: the dog casts to it" ("Dog ▸ This way" on touch).
- **The cast.** "This way" sent while the hunter faces a mark (within 25°, out to 200 m) casts the dog to the mark (the callout reads "This way · <dog> casts to your mark"). Otherwise it casts as before. Dead bird is unchanged.
- **No marker in the world.** A landing puff readable at 150 m would need a dust cloud 1.6 m across to cover 3 px on a phone, which would look wrong up close. The mark lives in the HUD, as a compass bearing does.

**Chukar on the canyon** (`f01045d`, `4c9e127`).
- **Downhill is the land under the covey.** The fall line is read on rings 10 and 22 m out (40 and 70 m on a flat bench): into the draw, or off the spur's flank (`flightLine.fallLine`). The property's general uphill is used only where the land is flat. Before, a wave poured down the property's general slope, which on a canyon wall is often across the real slope, or up it.
- **With the hunter below, the wave swings wide of him** (`riseScore.lanesClearOfTheGun`). It turns, together, to the side it leans, until every lane is clear of the bearing to the gun by enough to pass 9 m wide. Where the slope leaves no room, it closes up toward the contour. No lane climbs above the contour.
- **Every line, any species, is checked against the hunter's eye as it is planned.** A line that would pass nearer than 9 m (`PASS_CLEAR_M`), or nearer than it rose, curls the other way or bears off him; a chukar stays inside its fall-line fan. A turn into a landing that would bring it back past him is dropped, and the bird drives on.
- **A capture artifact, found on the way.** The capture walk-in (`hunt3d.triggerFlush`) moved the camera across the canyon without raising or lowering it. In captures, the birds therefore planned their lines, sky and landings from an eye metres off the hunter's real one. That is how a chukar passed 3.4 m from a hunter the planner thought it cleared by 9. The walk-in now keeps the eye's height over the ground. Play was never affected: the player system sets the camera every frame. M2's capture figures for Chukar Ridge (86% sky-backed) came through the same walk-in and should be read with that in mind; the lab's figures do not depend on it.

**Tools.**
- `tools3d/review-rise.mjs`:
  - `--shoot-at 15,30,45` takes each wave's hit as its first bird reaches that range, with frames at +0.07, +0.17 and +0.3 s and at the strike and 0.1 s after it.
  - `--approach below|level|above` steps the hunter round a point on its fall line, 24 m out, before he walks in.
  - Each fall is logged: range, feather size, strike, and the thump's delay. So is the nearest any line came to the hunter, and every fly-by: a line that came back nearer than it rose, inside 9 m.
- `tools3d/falls-sheet.py` and `tools3d/rise-pairs-sheet.py` draw the sheets below.
- `tools3d/mark-lab.mjs` is rewritten:
  - The hunter watches the birds going down and walks round the rimrock.
  - On this build he follows the game's own marks and casts to them. On an older build an ideal eye marks for him: every landing within 200 m with the land clear between, through any cover, whichever way he faces.
  - Every landing is logged, with when he last saw it and whether it was marked.
- `tools3d/rise-lab.mjs`:
  - It reports the closest pass, fly-bys, and chukar by approach with the share that poured downhill.
  - `--root` runs a baseline checkout through the same lab.
  - One wind per rise. The wind was drawn from the approach stream, so a build that read the hunt state more often flew different rises from different approaches.

### Numbers: falls

Rise review with shooting (`--shoot-at 15,30,45`), seed 7701, this branch. Each hit is taken as its wave's first bird reaches the range, after a 0.4 s reaction, so the nearest hit is often a little past 15 m. High 1440×810 and Lightweight 844×390 run the same simulation; the feather size is the smaller of the two tiers. The thump's delay is what the game schedules; a capture plays no sound.

| Ground | Hit at | Each feather on screen | Strikes | Thump heard after it lands |
| --- | --- | --- | --- | --- |
| Quail Fields | 15.7 / 30.2 / 45.4 m | 3.2 / 3 / 3 px | 1.3 / 1.0 / 0.9 s later at 19 / 36 / 54 m, ground | 56 / 106 / 158 ms |
| Sharptail Prairie | 23.0 / 28.3 / 45.3 m | 3 px | 1.2 / 1.6 / 1.6 s later at 29 / 37 / 53 m, ground | 86 / 107 / 156 ms |
| Pheasant Coverts (a rooster a run, three runs) | 20.0 / 30.5 / 45.3 m | 3 px | 1.8 / 1.2 / 1.1 s later at 24 / 45 / 61 m, ground | 68 / 132 / 177 ms |
| Chukar Ridge (the hunter above the covey) | 21.3 / 30.3 / 45.4 m | 3 px | 0.4 / 0.5 / 1.2 s later at 24 / 36 / 57 m, ground | 71 / 105 / 167 ms |

Before (the campaign head, same seeds), the shot bird falls in its flying shape with a few straw-coloured dots, and its strike throws nothing. The thump played at once, whatever the range.

**Exits.** In every capture of both builds, at both tiers, each bird fell, left the screen, set down in sight, landed in the cover it flew for, or was still flying when the capture ended; none vanished, and no page errors. This branch never has more than three birds inside 55 m; the campaign head had four on Sharptail Prairie and five on Chukar Ridge.

### Numbers: chukar on the canyon

**The line planner on the canyon.** This is the check behind `test/chukarLines.test.ts`, run on 50 coveys for both builds (the test itself runs 24). The coveys are placed by the land, 3 lanes each, with the hunter 12–26 m below, level with and above each covey on its fall line. The wave is planned as the birds subsystem plans it, then flown. Before is the old line choice: the property's slope, no swing wide of the gun, and no check on the pass. "Poured" is the share of lines a metre or more below where they rose by 2.5 s.

| Hunter | Before: lines inside 9 m / inside 5 m / nearest | After | Poured, before → after | Median drop by 2.5 s, before → after |
| --- | --- | --- | --- | --- |
| Below | 16 / 3 / 3.6 m | **0 / 0 / 9.3 m** | 49% → **65%** | 0.9 → **3.5 m** |
| Level | 0 / 0 / 10.2 m | 0 / 0 / 12.0 m | 69% → 73% | 3.6 → 3.6 m |
| Above | 0 / 0 / 13.7 m | 0 / 0 / 13.6 m | 90% → 91% | 6.6 → 6.7 m |

**In the browser** (rise review on Chukar Ridge, seed 7701, High 1440×810, `--approach`, shooting). The same point each time, with the hunter stepped round it to 24 m before walking in; the covey rose with him 19 m out. A fly-by is a line that came back nearer his eye than it rose, inside 9 m.

| Hunter | Before (campaign head): nearest any line came / fly-bys | After |
| --- | --- | --- |
| Below (3.3 m under the covey) | 6.4 m (the nearest bird rose at 6.8 m) / none | 8.3 m (rose at 6.8 m) / none |
| Level (0.4 m over it) | **0.7 m** / three: rose at 4.3, 6.1 and 7.2 m, came back to 0.7, 4.9 and 2.7 m | 5.3 m (a bird that rose at 4.8 m and flew away) / **none** |
| Above (1.5 m over it) | 20.7 m / none | 20.6 m / none |

Before, level with the covey, a chukar crosses the hunter's face at half a second, 81 px across on the screen; after, the wave pours off down and across to one side. From directly above, more birds go straight away down the fall line (4 of 7 lines against 2 of 7): that is the chukar rule's reward, the easy going-away shot.

### Numbers: the rise lab

`tools3d/rise-lab.mjs`, 6 hunts × 6 coveys a ground, each covey walked up on at 14–24 m from a seeded bearing, no shooting. Before is the campaign head; both builds fly the same rises from the same approaches.

| Ground (rises, birds) | Straightaways | Sky-backed, first second | Shot window: closest pair median / ≥ 5° / least per rise | Rise length, median (8+ birds) | Nearest any line came / fly-bys | Escapes set down / drove off |
| --- | --- | --- | --- | --- | --- | --- |
| Quail Fields (14, 78) | 28% → 29% | 61% → 60% | 24.0° / 96% / 14.0° → 24.9° / 96% / 14.0° | 6.8 (8.7) → 7.8 (10.1) s | 12.9 m / 0 → 12.9 m / 0 | 31 / 47 → 31 / 47 |
| Sharptail Prairie (12, 48) | 31% → 31% | 45% → 45% | 24.9° / 94% / 8.3° → 24.3° / 93% / 16.6° | 4.7 → 5.2 s | 11.5 m / 0 → 11.5 m / 0 | 17 / 31 → 17 / 31 |
| Pheasant Coverts (30, 60) | 12% → 12% | 58% → 58% | 13.3° / 85% / 10.9° → the same | 3.2 → 3.2 s | 8.1 m / 0 → 8.1 m / 0 | 14 / 46 → 14 / 46 |
| Chukar Ridge (17, 108) | 19% → **29%** | 13% → 18% | 22.4° / 98% / 5.8° → 22.6° / 98% / 9.0° | 7.0 (8.6) → 7.5 (9.2) s | **4.5 m / 6 → 10.6 m / 0** | 64 / 44 → **49 / 59** |

Chukar by where the hunter stood, before → after: above (17 birds), nearest 16.5 → 17.4 m, poured 88% → 100%; level (50), nearest 9.6 → 11.2 m, poured 57% → 68%; below (33), nearest 4.5 → 10.6 m, six fly-bys → none, poured 71% → 82%. The two Pheasant lines inside 9 m in both builds are roosters that rose that close and flew away.

The rises are longer on every ground but Pheasant Coverts, most likely because of the lane's stricter cap in `b6b0ba3`: a leaving bird now holds the next wave until it is 55 m off. Rises of eight or more birds take 10.1 s on Quail Fields, against 8.7 s.

Chukar set down less often in the lab: 49 of 108 against 64. It is not the gun check, which dropped none of the 45 landings the planner chose, and not the 35° rule. With the hunter placed as in the canyon test, the new lines choose a landing as often as the old ones did (315 and 301 of 450). A likely cause, not yet confirmed: chukar now pour straight down the real fall line more often, where the slope falls away out of the hunter's sight, so fewer spots along their line qualify. In whole hunts (the mark lab, below) the misses seen to set down on Chukar Ridge are 7.2 a hunt against 7.8.

### Numbers: marks and the follow-up (the mark lab)

`tools3d/mark-lab.mjs`, 20-minute hunts, seeds 1–6, a GSP at level 6. One entry per ground (South Gate); Chukar Ridge from River Road and Rim Gate, so 12 hunts there. Per hunt. Before is the campaign head with the lab's ideal eye marking for the hunter (every landing within 200 m with the land clear between, through any cover, whichever way he faces). After is this branch with the game's own marks: only what the hunter would see.

| Ground (hunts) | Misses seen to set down | Marked | Marked birds found again | Follow-ups on marks | All follow-ups | Flushes | Mark range, median / max | Mark to follow-up, median | Longest dry spell, median | Dry spells over 3 min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Quail Fields (6) | 8 → 6.2 | 7.5 (ideal) → **5.8** | 89% → **97%** | 6.7 → 5.7 | 7.3 → 6.0 | 13.7 → 12.2 | 73 / 84 → 77 / 107 m | 98 → 100 s | 287 → 285 s | 288 → 314 s |
| Sharptail Prairie (6) | 3.8 → 2.7 | 3.3 (ideal) → **1.8** | 30% → **45%** | 1.0 → 0.8 | 3.2 → 2.8 | 8.2 → 9.5 | 161 / 178 → 137 / 213 m | 84 → 78 s | 356 → 381 s | 505 → 535 s |
| Pheasant Coverts (6) | 2.0 → 1.0 | 2.0 (ideal) → **0.7** | 83% → 75% | 1.7 → 0.5 | 2.0 → 1.2 | 11.7 → 11.0 | 151 / 162 → 161 / 170 m | 109 → 80 s | 452 → 428 s | 505 → 471 s |
| Chukar Ridge (12) | 7.8 → 7.2 | 7.2 (ideal) → **5.8** | 45% → **70%** | 3.3 → **4.1** | 4.8 → 4.9 | 10.2 → 9.9 | 93 / 184 → 97 / 213 m | 104 → 137 s | 351 → 351 s | 445 → 365 s |

Of the landings in the after runs, the game marked 35 of 37 on Quail Fields (95%), 11 of 16 on Sharptail Prairie (69%), 4 of 6 on Pheasant Coverts and 69 of 86 on Chukar Ridge (80%). On Quail Fields only one of the 35 marks was a bird seen all the way to the ground; sand plum hid the last of every other. On Chukar Ridge 39 of 70 were seen to the ground. The hunter cast to a mark 21 times on Quail Fields and 21 on Chukar Ridge, but only twice each on the other two grounds.

The first version of the marks (a 1.5 s window, the mark where he lost the bird) gave Quail Fields 3.5 marks a hunt from 6.5 landings. Most unmarked bobwhite were last seen 1.5–2.5 s before they went in behind sand plum. The 2.5 s window and the glide mark took that to 5.8 of 6.2. Chukar Ridge marked birds found again rose from 60% to 70% at the same time.

The dry spells barely move. The lab's hunter walks the cover patch by patch, and his search sets the gaps between contacts far more than the follow-ups do. A follow-up on a mark comes 80–140 s after the mark, inside a gap that is mostly the walk.

### Evidence

Each sheet is a before block (the campaign head, from the baseline checkout on port 4621) over an after block (this branch, port 4611), same seeds, uncapped captures.
- **Falls close up**, both tiers: `birds/quail-fields-falls-m3-before-after.jpg`, `birds/sharptail-prairie-falls-m3-before-after.jpg`, `birds/pheasant-coverts-falls-m3-before-after.jpg`, `birds/chukar-ridge-falls-m3-before-after.jpg`. Each row is one hit at about 15, 30 or 45 m. Its crops, 11% of the screen's height, are taken at +0.07, +0.17 and +0.3 s, at the strike and 0.1 s later, enlarged with square pixels. On Pheasant Coverts one rooster rises at the point, so its after-block takes each range from its own run.
- **The rise with shooting**, both tiers, 0.5–4 s, birds ringed (cyan against the sky, orange against the land, grey falling): `birds/quail-fields-rise-shooting-m3-before-after.jpg`, `birds/sharptail-prairie-rise-shooting-m3-before-after.jpg`.
- **Chukar line choice**, the hunter below, level with and above the covey, High: `birds/chukar-ridge-approach-m3-before-after.jpg`.
- Regenerable runs on this machine: the captures in `/tmp/uplandin-rise/m3a-*` (after) and `m3b-*` (before); the rise lab in `/tmp/uplandin-rise/lab-m3-after2.json` and `lab-m3-before2.json`; the mark lab in `/tmp/uplandin-marks/after-b.json` and `before.json`.

### Self-assessment against the target

- **Falls read instantly.** Mostly, yes. At 15, 30 and 45 m the shot bird changes shape at once: the wings come in over 140 ms and it falls as a tumbling ball inside a puff of its own feathers, brown on a bobwhite and pale on a sharptail, where before it fell in its flying shape with a few straw-coloured dots. Every feather is 3 px or more on both tiers, so on a phone the puff still reads at 45 m, as a few coarse specks. Where it lands in view, the strike throws a pale puff 0.1 s later. The thump comes late by the distance: about 55 ms at 19 m, 105 ms at 36 m and 155 ms at 53 m. It cannot be heard in a capture; the times are the delays the game schedules. A bird that comes down in cover as tall as the eye (cattails, the far side of a plum thicket) is lost at the strike, as it would be.
- **Misses become chases you can mark.** Yes on Quail Fields and Chukar Ridge: the game marks 95% and 80% of the misses that set down, the HUD keeps the mark, a cast sends the dog to it, and 97% and 70% of the marked birds are found again. Partly on Sharptail Prairie, where most singles land out of sight and 45% of marked birds are found. Thinly on Pheasant Coverts: one rooster a hunt goes down where the hunter can see it.
- **Every exit is honest.** Yes. In every capture a bird fell, left the screen, set down in sight, landed in the cover it flew for, or was still flying when the capture ended; none vanished. No line passes back by the hunter: none inside 9 m in the rise lab, and no fly-bys in any capture of this build. The sky holds at most three birds inside 55 m, where the campaign head showed four or five.
- **At most three in the sky, each on its own line; crossing and quartering common.** Unchanged in kind. The wave rule holds on every ground, and straightaways stay under 40%: 12–31% in the rise lab. Chukar rose from 19% to 29%, because they now pour down the real fall line, which runs straight away from a hunter above them. The rises are a second or so longer: the lane's own cap (`b6b0ba3`) holds the next wave until a leaving bird is 55 m off.
- **The decision** (every core species can set down in visible, reachable cover after the shooting window, and the follow-up is a second act): met for bobwhite and chukar; met in part for sharptail; not yet for the rooster, whose landings are mostly out of sight.
- Not this milestone: knowing the bird by eye and ear at 30–40 m on a phone, and birds before the flush.

### Open issues

- **Pheasant Coverts gives few marks.** A rooster sails 90–170 m into cattails, and from inside cover as tall as his eye the hunter rarely sees one go in: 1 landing in sight a hunt and 0.7 marks. That is honest for cattails, but the second act there is mostly the dog's. Two ways to look at it next: let a rooster's landing line prefer the near edge of a stand, where a hunter on the stubble could see it go in; or count a rooster marked by the sail alone (he watched it set its wings at 100 m and knows the stand), not its last 2.5 s.
- **Sharptail singles are mostly relit unseen.** The lab relit 7.3 singles a hunt but saw 2.7 set down: most are credited out of the shot and land past the screen's edge, 100–190 m out on open prairie. Of the marked birds, 45% are found again. The lab's hunter cast to a sharptail mark only twice in six hunts, so this is partly the lab's simple follow-up, and wants a look in play.
- **Glide marks on Quail Fields are seldom to the ground.** 34 of 35 bobwhite marks were "going in". The glide mark lands within scent range (the dog winds a single at about 40 m), and 97% of marked bobwhite were found again, but a player sees a bird drop behind a plum thicket far more often than land. The quail crown estimate is statistical (the procedural plum shrubs are placed at random from the plum runs), so in the browser a bird may be hidden or seen a few metres differently from what the game assumed.
- **From directly above, chukar go straight away more often** (4 of 7 in the capture, against 2 of 7 before), because they now pour down the real fall line, which runs straight away from a hunter above them. Across the rise lab's approaches the chukar share of straightaways is 29%, against 19% before, inside the 40% target. Brady may want a little more swing across the draw from above.
- **Chukar set down less often in the rise lab** (49 of 108 against 64), not explained yet. It is not the gun check or the 35° rule, and the planner on its own chooses as many landings as before. The likely cause is the straighter pour down the real fall line, where the ground falls away out of the hunter's sight. Whole hunts barely notice it (7.2 misses a hunt seen to set down, against 7.8).
- **A bird can reach its landing spot high above it and sink almost straight down.** In a Quail Fields playthrough a bobwhite was last seen 14 m over the spot where it then set down, with no speed across the ground, sinking. A landing line only starts down 22 m short of its spot, and sinks at most 3.5 m/s, so a bird that comes to a spot low in a dip finishes its descent over it. Start the descent earlier when the bird is high above its spot (a glide slope). This is from M2's flight lines and was not changed here.
- **The second act does not shorten the dry spells.** In the lab the longest dry spell is set by the hunter's search between coveys, not by the follow-up. A follow-up is a reward inside a hunt, not a pacing fix.
- **Phone layout not captured.** The MARK beacon sits beside WIND on touch (TRUCK is hidden there) and hides with the beacon when the gun is raised. Screenshots in mobile emulation crash the tab under the uncapped flags, so this is verified by the stylesheet only.
- **A Lightweight capture tab died twice** (Chukar Ridge in the first falls run, "execution context was destroyed"; Pheasant Coverts at 30 m, "navigating frame was detached"). Both ran clean on another try. It is the known risk of phone emulation under the uncapped flags, but worth watching on a phone.
- **Look closer narrows what he marks.** Marking reads the camera's view, so with the 30° look-closer view held, a bird going down outside it is not marked. A hunter's eye would still catch it.
- Still open from M2 and M1: leaving birds on screen (now capped at three inside 55 m), Chukar sky-backing when walking the rim, thunder frame time on a real phone, and the scattered-covey pacing sweep.

### Files touched outside lane ownership (M3)

- `src/three/subsystems/hunt3d.ts` (Landform's canyon fixes live here too):
  - `resolveBird` moves an escape landing off the rock;
  - `rockAtWorld` is new;
  - a cast snaps to the mark the hunter faces, and its feedback says so;
  - `triggerFlush` keeps the walk-in's eye over the ground.
  The merged lane commit adds `surfaceAtWorld` and the 200 m cast reach.
- `src/three/subsystems/huntHud.ts` and `src/three/field.css`: the MARK beacon, the mark callout and the cast cue.
- From the merged lane commit `b6b0ba3`, unchanged here: `src/audio.ts` (`playFall`), `src/game/huntSimulation.ts` (a single's flush distance, circle-back landings), `src/game/huntDoctrine.ts` (circle-back on the core grounds), `src/game/closeFlush.ts`, `src/three/subsystems/fieldAudio.ts` (singles call to their covey), `src/three/assets/birdLegs.ts` and `pheasant.ts` (a leg at a time).
- New, in the lane: `src/game/marks.ts`, `test/hunterMarks.test.ts`, `test/chukarLines.test.ts`, `tools3d/falls-sheet.py`, `tools3d/rise-pairs-sheet.py`.
