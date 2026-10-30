# Dog lane log

Lane branch `feat/dog-locomotion-audit`, from the campaign head `957f40a`. The lane owns the dog in motion. Evidence images live in `docs/3d/campaign/dog/`; videos stay out of the repo.

Brady's last recorded verdict on the dogs (`docs/3d/production-finish.md`, September 28): he likes the GSP's improvement but finds both dogs' movement "awkward and repetitive", and asked to keep both bodies while improving locomotion, judged on the actual runtime renderers under matching cameras, lighting and changing speeds. Nobody had judged the motion as a whole since the setter moved onto the skinned rig, the slam into point, the bound through cover, delivery to hand, the Griffon and the readability pass.

## Milestone D1: the dog in motion (2026-10-30)

### How it was audited

The motion was judged on the real thing, fed real dog work, in a way a before and an after can share.

- **Real dog work.** `tools3d/dog-trace.mjs` runs one hunt through the Landform lane's hunt lab and records the lead dog every tick: position, the two headings the renderer interpolates, state, gait, scent beat, slam, creep, retrieve, the hunter, and the bird it reaches for. Two 240 s traces on Chukar Ridge from the south gate, seed 48291:
  - a level-8 GSP following the trail: three points, a relocate on "hunt on", a retrieve to hand, a whistle-in to heel and a cast-off;
  - a level-1 pup: seven points, two creeps, a break.
- **The runtime renderer, side by side.** `tools3d/dog-motion-bench.mjs` (browser half `tools3d/dogMotionBench.ts`) replays a trace through the actual `GeneratedDogSystem` and its contact solver for the GSP, Setter and Griffon at once, under one camera and one light, on the same terrain triangles the game draws. It renders three views per frame:
  - a broadside chase at 4.2 m;
  - the hunter's 70-degree view, a 1:1 window of a 1920×1080 frame round the dog (what a player gets at 20–60 m);
  - the 30-degree hold-G closer look, the same way.
  It also runs synthetic segments the traces lack: a pace ramp (0 → 0.8 → 2 → 3.6 → 5.5 m/s and back), cast-end reversals at 5.2/3.9 m/s, a slam into point with a creep step, a bound through 1.5 m cover, and a 29-degree sidehill. Per frame it records every paw's plant, drift and clearance from both the smooth heightfield and the drawn triangles, clamps, gait, trunk pitch and roll.
- **Same bench, either checkout.** The bench bundles the renderer from a chosen checkout. Before runs bundle the read-only baseline (`campaign-base`, `957f40a`) and serve on 4625; after runs bundle this branch on 4615. Travel, cameras and light are identical.
- **The real field.** `tools3d/dog-field-check.mjs` loads the actual game under `?capture` on Chukar Ridge (seed 48291) and walks the hunter along the recorded GSP hunt's path until each breed holds its first point (52–60 s in). It frames the dog from eye height at 25, 30 and 40 yd at both lenses, with and without the dog, for `tools3d/dog-field-pixels.py`, and measures each supporting paw against the terrain triangles actually in the scene. It uses only `__api3d` and `__dogAudit`, so the before run comes from the baseline checkout itself, with its own server on 4625.
- **Cost.** `tools3d/dog-motion-cost.mjs` times the field-motion update in Node with a nanosecond clock over the GSP trace, bundled against either checkout (the browser's timer is coarsened to 0.1 ms).

What the simulation hands the renderer matters as much as the renderer: a quartering GSP runs at 5.1 m/s on average (the gallop band) and spends about a tenth of its quartering in hard cast-end turns (yaw rate over 1.95 rad/s at the 90th percentile, 3.2 at the 99th). Making game is a stop-go of dead stops of up to 0.3 s between 1.8–3.9 m/s bursts, every second or two for ten to fifteen seconds at a time.

### The audit (before, `957f40a`), by how often a player sees it

1. **The quartering dog rides its strides like a plank on a rail.** A dog seen at 20–60 m is mostly cantering or galloping, and the generated rig carried the whole trunk on one bone. The locomotion sampler already computed pelvis, loin and chest motion, but the rig had no joint to use it. The body's rise was scaled to a quarter and then smoothed. Across the whole pace ramp, walk to gallop, the trunk pitched 1.3 degrees in all, never rolled, and rose a few millimetres. At the hunter's distance, legs flickered under a bar that slid along at constant height: the robotic, repetitive read.
2. **Turns don't lean, and the lead never changes.** The bank was clamped at 0.09 rad (5 degrees). A cast-end reversal that a real dog takes leaning 20–45 degrees spun the dog upright like a post. The gallop and canter always led on the same side, whichever way the dog turned.
3. **The paws sink into the drawn slope on Chukar Ridge.** The dog planted on the smooth heightfield. The game draws a triangulation of it, 2.4 m on High and 3.7 m on Lightweight. On the canyon's folds planted paws sat up to 10–16 cm inside the drawn ground on High and 20–32 cm on Lightweight, "legs through the ground on slopes". On point the supporting feet were buried 5 cm (High) and 6.6 cm (Lightweight) for the whole hold. Just after delivery to hand, the dog's closest moment to the camera, all four feet stood 9–14 cm under the drawn slope.
4. **Making game shuffles the feet.** The simulation stops the dog dead for checks of a tenth to a third of a second, every second or two while it works the scent, and the renderer stepped a foot at every turn: 83 corrective steps in 26 s of scent work. Seventeen squared the stance up during the checks; 66 came as the dog moved off again on feet that no longer matched its stride.
5. **Head and tail are metronomes.** The searching head scanned on a fixed 0.26 Hz sine of ±0.10 rad and the tail wagged on a fixed 1 Hz sine. The carried bird came back with a still tail.
6. **On the steepest faces a standing dog can read as rearing.** The trunk pitches with the slope up to 17 degrees and the legs absorb the rest.

What already read well and was kept: the slam's skid and snap into point, the creep, the point itself (head, raised foreleg, the authored tail), the pickup reach and the presenting head at delivery, the bound's leap through tall cover, and the contact-locked feet on level ground (planted paws hold within 2.5 mm a frame).

### What changed

Each in its own commit, in the order above.

- **A loin** (`generatedGsp.ts`, commit "Give the dog a loin"). A pelvis bone bends against the ribcage high in the loin; the croup, hips, hind legs and tail hang from it, and the trunk's skin (and the setter's belly fringe) blends across the loin from the last rib to the croup. At rest it is the identity: the bind pose, coats and head shapes are unchanged, and so is every pose until something moves it. The leg solvers work in each leg's own parent frame.
- **The trunk works through the stride** (`generatedGaitBody.ts`, applied in `generatedFieldMotion.ts`). Over the chosen contact targets and before the legs are solved, so planted paws stay put:
  - canter: the rocking-horse gait, nose up on the hinds and down onto the lead fore (±4 degrees), one rise in its flight;
  - gallop: the forehand rides up off the hind drive into the long extended flight and drops to catch on the fores (about ±3.5 degrees); the loin stretches out after the hinds leave the ground and gathers under in the short gathered flight (+11/−9 degrees); the trunk rises 2.6 cm into the extended flight;
  - trot: a firm topline that lifts about a centimetre in each diagonal's flight;
  - walk: a swaying pelvis and two small rises a stride;
  - bound: the loin opens through the leap and bends hard as the hinds come under.
  The neck takes back half the pitch so the head holds the line of travel, and the ears' springs now get real motion to answer. Breed vigour (`BreedMotion.verticalMotion`) scales it, so the setter is loosest and the GSP and Griffon tighter. The breed's run stride sets its cadence (the Griffon's shorter stride is quicker). Each stride varies a little: ±3% in length and ±12% in action. On the steepest faces the action halves, as a climbing dog shortens up, which keeps planted hinds in reach.
- **Banked turns on the inside lead** (`generatedBodySupport.ts`, `generatedFieldMotion.ts`). A turning dog leans from its feet: 60% of the lean that balances the turn (atan of speed × yaw rate over g), up to 23 degrees. The trunk swings to the inside over paws that keep their line. The head stays nearer level than the back, the hips trail inside the chest round the curve through the loin, and the head looks round the turn. A cantering or galloping dog takes the inside lead and changes it in the air between strides, as dogs do. The fixed touchdown table now has its mirror.
- **Paws on the drawn ground** (`terrain.ts`, `chukarTerrain.ts`, `quailTerrain.ts`, `propertyTerrain.ts`, `quailGroundGeometry.ts`, `generatedDog.ts`, `generatedFieldMotion.ts`). `TerrainSystem.surfaceHeightAt` answers with the triangles actually drawn under a point, near or far tile as the camera currently draws them, on every ground. The dog plants paws, steps and stance on it, while the trunk's slope posture still reads the smooth heightfield so the back doesn't kink at triangle edges. Chukar's plants already root on the drawn grids; the dog was the odd one out.
- **Checking, glancing and wagging like a dog** (`generatedFieldMotion.ts`, `generatedScentMotion.ts`). A dog that checks itself mid-run stands braced on the feet it stopped on, and squares up only if it stays stopped for 0.8 s or points; it moves off from that braced stance. The searching head mostly faces the wind and now and then snaps a look off to one side, at irregular moments and scaled by the breed's head freedom. The tail's beat and swing drift, a busier breed wags faster, and a dog coming back with a bird carries its tail up and swinging.

Not touched, as asked: dog retirement, the GSP point tail (`setPose('point')` is unchanged and the tail sits on a pelvis at rest whenever the dog is still), the pup scent-range minimum and the cast hint, the bodies, coats and heads, and the search and cast decisions in `src/game/dog.ts` (no edit to `dog.ts` at all).

### Numbers

Bench runs replay the same traces and synthetic runs through each checkout's renderer, at 1:1 timing, 60 Hz. The three breeds give near-identical contact numbers, so the worst of the three is shown unless a breed differs.

**Paws against the drawn ground on Chukar Ridge.** Worst planted paw inside (−) or above (+) the drawn triangles, and paw-frames planted more than 2 cm inside:

| Segment (trace) | High before | High after | Lightweight before | Lightweight after |
| --- | --- | --- | --- | --- |
| Quartering, 30 s | −102 / +37 mm, 86 | 0 / 0, 0 | −204 / +70 mm, 85 | 0 / 0, 0 |
| Making game, 26 s | −158 / +43 mm, 201 | 0 / 0, 0 | −322 / +74 mm, 219 | 0 / 0, 0 |
| Retrieve and delivery, 15 s | −138 / +20 mm, 287 | 0 / 0, 0 | −257 / +49 mm, 279 | 0 / 0, 0 |
| Point, "hunt on", relocate, 11 s | −54 mm, 1,747 | 0, 0 | −66 mm, 1,761 | 0, 0 |

In the real game (`dog-field-check.mjs`, each breed's first held point on the seed-48291 hunt, raycast against the scene's terrain), this point is on gentler ground. The supporting paws stood up to 11 mm above the drawn ground on High and 20 mm on Lightweight (the Setter); after, all 0 mm.

**The trunk through the stride** (pitch and roll ranges over a segment, radians):

| | Before | After (GSP / Setter / Griffon) |
| --- | --- | --- |
| Trunk pitch over the pace ramp, walk to gallop and back, flat ground | 0.023 (1.3°) | 0.159 / 0.168 / 0.151 (9.1° / 9.6° / 8.7°) |
| Trunk roll through six cast-end reversals at 3.9 m/s | 0.171 (±4.9°) | 0.679 (±19.4°) |
| Trunk roll over 30 s of quartering on Chukar (slope included) | 0.455 | 1.044 |

**Contact quality while moving** (High; Lightweight is within a step or a few millimetres):
- **Corrective steps in 26 s of making game:** 83 / 86 / 86 → 61 / 60 / 54. Before, 17 of the GSP's were squaring up during checks and 66 were moving off; after, 11 and 50. The rest are first strides out of a stand, set by how often the simulation stops and starts.
- **Planted-paw drift** stays 0–2.5 mm a frame in every segment but three. The bound's first stride out of cover slips a hind paw that is out of reach: 5 mm before, 17.5–23.6 mm after, for one frame. The pup's break does the same: 21 mm before, 25–31 mm after, for one frame. The setter's sidehill climb slips one paw 3.8 mm.
- **Clamped legs** (a paw past its reach for a frame) are unchanged except on the 29-degree sidehill: 1–2 → 3–8 frames of 1,065. The pup's creep goes 0 → 1 on High.

**Point readability** (visible dog pixels counted in a box round the dog with and without it, the first held point, 30 yd from eye height):

| | 70 degrees, before → after | 30 degrees, before → after |
| --- | --- | --- |
| GSP, High | 145 → 152 | 992 → 986 |
| Setter, High | 183 → 182 | 1,229 → 1,232 |
| Griffon, High | 190 → 201 | 1,198 → 1,202 |
| GSP, Lightweight | 119 → 114 | 812 → 821 |
| Setter, Lightweight | 134 → 110 | 974 → 861 |
| Griffon, Lightweight | 216 → 211 | 1,264 → 1,211 |

The point pose is untouched, and at 25 and 40 yd the counts stay within about ±13%: the wind sways the grass between the two renders. The one drop beyond that noise is the Setter on Lightweight (11–18%). There it now stands on the drawn ground instead of floating 1–2 cm above it, so the cover at its feet hides a little more of its legs.

### Frame cost

`dog-motion-cost.mjs`, the field-motion update over the 240 s GSP trace, Node on this M1 Pro, median of three rounds, ms per dog per frame:

| | GSP | Setter | Griffon |
| --- | --- | --- | --- |
| High | 0.071 → 0.078 | 0.066 → 0.084 | 0.065 → 0.085 |
| Lightweight | 0.066 → 0.074 | 0.065 → 0.077 | 0.066 → 0.070 |

The rounds' minimums move from 0.065–0.067 to 0.070–0.072. In the game the paws also read the drawn ground: about 21 lookups a frame at 1.6 µs each, so roughly 0.035 ms more. All told, about 0.05 ms per dog per frame on this desktop, 0.3% of a 60 fps frame. There are no new meshes, draws or triangles; the skeleton has one more bone. No phone has been measured.

### Evidence

All before/after, from the final runs. Rows are GSP, Setter and Griffon, each before then after. Every image is under 400 KB.

- **Gaits, broadside chase on flat ground:**
  - `dog/gallop-high.jpg` and `dog/gallop-lite.jpg`: ten consecutive frames;
  - `dog/canter-high.jpg` and `dog/canter-lite.jpg`;
  - `dog/trot-high.jpg` and `dog/trot-lite.jpg`;
  - `dog/walk-high.jpg` and `dog/walk-lite.jpg`.
- `dog/turn-high.jpg`: a cast-end reversal through the hunter's closer look from 30 m behind. Before, the dog comes round bolt upright; after, it banks in.
- `dog/quartering-eye-high.jpg`: Chukar quartering in the hunter's 70-degree view at its real 1:1 pixels, shown ×2.
- `dog/scent-look-high.jpg`: making game, through the closer look.
- `dog/sidehill-high.jpg`: turning up and climbing a 29-degree face.
- `dog/contact-point-lite.jpg` and `dog/contact-delivery-lite.jpg`: on point, and delivering on the canyon side, broadside on the game's own drawn Lightweight slope.
- `dog/point-30yd-high.jpg` and `dog/point-30yd-lite.jpg`: the real game, each breed on point at 30 yd at both lenses, with the supporting paws close up.

Videos (not committed) are on this machine:
- the bench: `/tmp/dog-audit/final-{before,after}-{high,lite}/video/*.mp4`, one per segment, every breed and view in sync;
- the field frames: `/tmp/dog-audit/field-{before,after}-{high,lite}/`.

To reproduce:
- `tools3d/dog-trace.mjs` with the two traces' settings (above);
- `tools3d/dog-motion-bench.mjs --segments "quarter=gsp8:116-146,scent=gsp8:26-52,retrieve=gsp8:70-85,relocate=gsp8:99-110,recall=gsp8:148-168,creep=gsp1:162-172,break=gsp1:73-80,paces,turns,slam,bound,sidehill"`, with `--root` the baseline on port 4625 or this branch on 4615;
- `tools3d/dog-field-check.mjs`, run from each checkout, then `tools3d/dog-field-pixels.py` on its reports;
- `tools3d/dog-motion-sheet.py` for the strips.

### Tests

tsc is clean, and the production build passes with the existing large-chunk warning. The full suite (`tools3d/heavy.sh npx vitest run --maxWorkers=2` at `dfbb278`) runs 2,074 tests in 250 files, and 2,073 pass. The one failure is the Chukar case of `test/birdVariety.test.ts`, which times out at about 7.6 s against the 5 s default. It fails the same way on the campaign head `957f40a` in a clean checkout, and this branch touches nothing it reads (no `src/game` or bird files). It is one for the Birds or Landform lane.

Eleven tests are new:
- **Trunk laws:** continuous through the stride boundary for every gait and lead; a canter and gallop rock far more than a trot; the gallop gathers in its short flight and stretches in the long one.
- **Loin skinning:** the croup follows the pelvis and the ribcage stays put.
- **Turns:** the lean goes toward the inside of either turn and stays within every leg's reach; the inside lead, changed in the air without sliding a planted paw.
- **Contact:** paws plant on a drawn surface that departs from the smooth one; the drawn-ground query matches the Chukar tile triangles near and far on both tiers.
- **Stopping and searching:** a third-of-a-second check takes at most one step; the search glances to both sides at irregular moments on a drifting wag.

### Self-assessment

- **What reads better, as a hunter would see it.** The turn is the biggest gain at hunting distance. A cast-end reversal at 30–60 m now banks into the turn and comes out of it, where the dog used to spin upright like a post, and it takes the inside lead. Broadside at 10–30 m, the gallop and canter finally carry their weight: the back gathers and stretches, the forehand rides up and drops, and the canter rocks. On Chukar's slopes and on Lightweight the legs no longer vanish into the ground, most of all at the moments a hunter looks closest: the point, and the delivery to hand.
- **What is only partly better.** At 40–60 m in still frames the rocking is subtle. It reads better in motion than in strips, but it is restrained, and Brady may want more (question 1). Making game still stop-starts, because the simulation does: the feet shuffle less, but the rhythm is the same.
- **What is not fixed.**
  - The steep-face posture: with the legs now reaching the true slope, a dog presenting across a 30-degree face stands tall and pitched up.
  - The gait switch in every reversal.
  - Two single-frame paw slips that got slightly worse.
  - The heel walk and recall beyond the gaits' own changes.
  - Swing feet in the gallop's flight.
- **Risk.** The changes stay in presentation. The simulation, the point pose, the coats and the bind pose are untouched, and the pelvis is the identity whenever the dog stands still. The new terrain query is additive. Every existing dog test passes; the only test edits are the ones this motion makes necessary (above).

### Questions for Brady

1. **How much lean and rock?** A turning dog now leans 60% of the way to the balancing lean, up to 23 degrees. The gallop rocks about ±3.5 degrees with ±10 degrees through the loin, and the canter ±4 degrees. More reads bigger at 40 yd and turns a touch cartoonish; less is more restrained. Each is one constant.
2. **Flying lead changes on the straight?** Leads now change only into turns. Real dogs also swap now and then on a long straight run, which would add variety.
3. **The scent stop-go itself.** The feet no longer shuffle, but making game is still the shared simulation's dead stops between bursts, every second or two for ten to fifteen seconds. That rhythm may be much of the "repetitive" read. Changing it is a scent-design call in `src/game/dog.ts`, outside this lane and next to the Landform lane's casting work. Worth revisiting?
4. **Does each breed move like itself?** The setter rocks the most and the GSP and Griffon are tighter. The Griffon's shorter stride makes its cadence quicker, and head and tail looseness follow each breed's profile. Is the Griffon's quicker, tighter action right for your dog?
5. **Head carriage at the gallop.** A searching dog carries its head about level with its back, nose forward. A higher, wind-winding head would read more "bird dog" at distance. Preference?
6. **Steep faces.** The trunk follows the slope up to 17 degrees and the legs take the rest, so a dog standing across the Cheat Face can still look braced. Should it follow the slope further?

### Open issues for the lead

- **Gait changes in every reversal.** A cast-end reversal slows the dog below the gallop's 4.1 m/s threshold, so it drops to a canter and back up in each turn (two 0.24 s blends a turn). It reads acceptably now that leads and lean change with it, but it is a lot of switching.
- **Other things on the smooth heightfield.** Grounded birds and other contacts still sit on it, so a downed bird in a fold can lie inside the drawn slope on Lightweight. `TerrainSystem.surfaceHeightAt` is there for them (Birds lane).
- **Two single-frame paw slips, both pre-existing, both a little larger now.** Leaving 1.5 m cover, the bound's first gallop stride slips a hind paw at its reach limit: 1.8–2.4 cm for one frame (5 mm before), hidden in the cover. The pup's break slips one 2.5–3.1 cm for one frame (2.1 cm before).
- **Feet in the gallop's flight.** Swing paws do not rise with the trunk, so the legs reach a little further down in the extended flight than they would.
- **Phone cost.** The cost numbers are desktop Node; no phone measurement yet.
- **Menu portraits.** The static menu portraits (`public/art/menus3d/dogs/`) predate this. The live preview already runs the new motion.
- **No natural-input playthrough.** The in-game checks use capture mode with a scripted hunter path. No natural-input playthrough has been recorded on the new motion.

### Files touched outside `src/three/dogs`

- `src/three/subsystems/terrain.ts`, `chukarTerrain.ts`, `quailTerrain.ts`, `propertyTerrain.ts` and `quailGroundGeometry.ts`: an additive `surfaceHeightAt` (the drawn triangles under a point) and the per-tile grid each terrain needs to answer it. Nothing else in them changes.
- `src/three/subsystems/generatedDog.ts`: passes the drawn surface to the dog's contact solver (two lines).
- Tests:
  - new `test/generatedGaitBody.test.ts` and `test/drawnGround.test.ts`;
  - `test/generatedFieldMotion.test.ts` (the slope posture test reads the stride's pitch);
  - `test/generatedGsp.test.ts` (the loin skinning);
  - `test/generatedSetter.test.ts` and `test/generatedGriffon.test.ts` (hind placement measured in world space, since the hips hang from the pelvis);
  - `test/generatedPivotSteps.test.ts` (a 20 s budget for its heavy stationary-turn case, which brushed the 5 s default on a loaded machine with or without these changes).
- Tools: `tools3d/dog-trace.mjs`, `dog-motion-bench.mjs`, `dogMotionBench.ts`, `dog-motion-sheet.py`, `dog-field-check.mjs`, `dog-field-pixels.py` and `dog-motion-cost.mjs` (all new).
- `src/game/dog.ts`: not touched.
