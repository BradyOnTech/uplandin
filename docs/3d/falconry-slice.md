# Goshawk from the fist

The first falconry hunt uses Cattail Coverts, one finished GSP, and one juvenile goshawk. It is a 3D Quick Hunt. The handler walks the point, offers a slip at a visible rising bird, watches an autonomous pursuit, and recovers the hawk before the next search.

**Working alongside terrain design**

This work lives on `codex/goshawk-falconry` in `/Users/bradya/Documents/code/uplandin-falconry`, based on commit `070ec81`. The original checkout now holds the terrain work on `codex/chukar-ridge-production`; the two checkouts are independent. Preview this work on port 4527; leave the terrain agent's server and checkout alone.

Falconry owns the new pursuit model, goshawk presentation, Quick Hunt selection, recovery and mode-specific controls. It does not edit `areas.ts`, `landscape.ts`, `palette.ts`, `vite.config.ts`, or Chukar terrain and assets. Merge reviewed branches one at a time. Resolve any overlap in common launch or bird code on the feature branch, then rerun the hunt checks. Do not copy whole files from one checkout over another. The committed terrain diff through `a4cc807` has no file overlap with this slice.

**Start a hunt**

Run `npm run dev:3d -- --port 4527 --strictPort` from this worktree with a supported Node version (validation uses Node 24). Open `http://localhost:4527/index3d.html?play=quick&method=goshawk`. A `seed` query parameter replays a visit.

The regular Quick Hunt screen also offers Goshawk in the Hunt loadout picker. This selects the finished GSP and Cattail Coverts and launches the 3D presentation. Shotgun setups retain their existing choices. Quick Hunt does not settle or save a career.

| Control | Action |
| --- | --- |
| WASD / Shift | Walk / run |
| Q | Recall the dog; cast off again when the hawk is back |
| Space / Slip | Offer a visible airborne bird to the goshawk |
| R / Recall hawk | End the pursuit and bring the hawk back |
| F / Watch hawk | Toggle tracking from the handler's position |
| E / Pick up | At arm’s reach, offer the glove and lift the hawk; the dog waits beside it |
| M / Esc | Survey map / pause |

Touch retains movement and looking on the field and exposes separate hawk action buttons. A missed slip does not automatically offer another bird. An unsuccessful flight returns the hawk; a successful one leaves it with its quarry until the handler walks in and picks it up. Recall cannot take the hawk off quarry. After return, whistle to restart the dog's search.

**Fast practice drill**

Open `http://127.0.0.1:4527/index3d.html?play=quick&method=goshawk&practice=slip`. This is a separate, visibly labeled practice setup on Cattail Coverts: one planted rooster 28–31 metres (about 31–34 yards) ahead, a finished dog already in scent, a favorable breeze, frost, and balanced challenge. A fresh visit seed varies the bird within a narrow corridor and supplies the existing flight variation; the South Gate coordinate frame stays fixed. Morning is the default light.

Wait for the dog to point, walk toward it and continue in the direction of its nose, then face the flush and press Space. Press T or New drill for a fresh nearby opportunity at any stage; the summary also offers New drill. Repeat setup or reloading preserves the current URL seed and stages that opportunity again. Your approach and slip timing still affect the flight. No career progress is saved.

The rooster holds rather than running and has a one-minute nerve allowance on point. The dog establishes the point through normal scent AI. Ordinary flush, pursuit, escape, guarding and hand pickup rules remain in use. The starting hunter is outside the dog's normal handler exclusion distance. Ordinary Quick Hunts and career hunts retain their original spawns.

| Before | After |
| --- | --- |
| Testing required searching the property before the first point. | The explicitly selected drill stages one nearby opportunity and casts off the dog automatically. |
| Hunt again rerolled the visit. | Practice offers a fresh nearby drill from the field or summary, plus an exact setup replay in the field. |

The original fixed-seed `tools3d/falconry-playthrough.mjs catch 61 --practice` verified a point without hunter movement in 0.7 seconds, a slip about 9 seconds after entry, and hand pickup about 25 seconds after entry. It also verified a fresh point after the summary restart and reset through the T shortcut. The delayed-slip practice run also verified an escape, empty return, summary and both restart routes. These are automated diagnostic timings, not a device performance promise. The full suite passed 102 files and 764 tests, and the production build passed with the existing bundle-size advisory.

**Modest practice variation**

The drill retains one holding rooster, a finished dog, favorable scent and a nearby point. New visits choose a seed instead of forcing 61. Placement varies by roughly six degrees either side of the original bearing and stays 28–31 metres from the hunter. The bird renderer now derives its practice flight stream from that seed; ordinary hunts retain their established streams. Speed limits, catch radius, pursuit, escape and recovery rules are unchanged.

| Before | After |
| --- | --- |
| Every practice visit forced seed 61 and the same bird position. | A new visit rolls a seed; the URL preserves it for reproduction. A bounded placement stream keeps the bird nearby. |
| The flight renderer restarted from the same internal seed. | Practice flights use the visit seed for their existing impulse, break and drift variation. |
| T and both restart buttons repeated the setup. | T, New drill and the summary button request a new seed; Repeat setup reloads the current one. |
| Checks assumed fixed placement. | Unit checks cover bounded placement, seed variation, deterministic replay and normal-mode isolation. Browser checks cover quick points across five visits, exact setup replay, and a changed seed and placement after T. |

`node tools3d/falconry-practice-variants.mjs` verified five distinct opportunities with points in 0.74–1.76 seconds after entry, without walking the hunter. These are diagnostic timings rather than device performance claims. Build and 23 focused tests passed. Browser evidence lives in `output/playwright/falconry/practice-variants.json`. The ordinary-input seed-61 playthrough completed the changed flight, catch hold despite recall, dog guarding, hand pickup, summary and fresh-seed restarts through both summary and T.

**Implementation**

`src/game/falconry.ts` owns pursuit, commitment to one quarry, swept interception, recall, landing and handler recovery in metres and seconds. The existing 3D bird controller supplies live quarry positions and velocities; nearby quarry can jink in response to pursuit. Both advance on the existing fixed 30 Hz clock. This slice adds a shared pursuit model without moving the existing shotgun flight controller out of the 3D adapter.

A caught bird enters `held`, which the dog cannot retrieve. The hunt records the catch once, waits for the completed hand pickup before bag credit, and blocks ending the session while the hawk is away or quarry remains held. The dog returns toward the handler during the flight. After a catch it approaches a spot beside the hawk and takes a down stay, remaining there as the hunter walks in. A whistle does not release that stay while the hawk holds quarry. After pickup, whistle to resume hunting. Shotgun construction and input are disabled in falconry.

The model and glove are editable procedural studies in `src/three/assets/goshawk.ts`. They can be replaced by a finished asset without changing hunt rules. The current bird uses pale cream and taupe plumage from the supplied references, with stronger streaks on the breast and nape, a pale eyebrow and yellow iris.

**Validation**

`test/falconry.test.ts` exercises target eligibility, geometric catches, escapes, recall, return, repeated slips, arm’s-reach pickup, delayed recovery credit, refusal to recall off quarry, dog guarding, duplicate credit, hunt completion and career isolation. The existing suite checks compatibility with shotgun hunts.

`tools3d/falconry-playthrough.mjs` drives an isolated browser using keyboard and mouse input. Read-only telemetry assists its aiming. It does not teleport the hunter, force a point, flush birds, or manufacture a catch. It saves evidence under `output/playwright/falconry/`. Its frame-limit override is a test-browser workaround; results are not a device performance benchmark or human usability study.

The complete suite passed: 101 files and 762 tests. The production build passed with the existing bundle-size advisory. The Quick Hunt picker was exercised through South Gate into 3D, including a launch from the 2D renderer preference. The field was visually checked at desktop size and at 844 by 390 pixels.

The seed-61 browser catch run completed a natural dog point, slip, catch, dog guarding, hand pickup, cast-off and field summary. The updated catch run also rejected recall off quarry and recorded the hand pickup at close range. The earlier first-slice delayed-slip check on the same route completed an escape, empty return, cast-off and summary. An early-recall run also returned the hawk, waited for the dog to settle and the pheasant to escape, then completed cast-off and summary. All three runs verified pause and no career-save change. See the local JSON manifests and screenshots under `output/playwright/falconry/`.

**Change review**

| Before | After |
| --- | --- |
| Quick Hunt offered gun loadouts and freely adjustable companions and property. | `QuickScene.ts` adds a goshawk choice, fixes one level-10 GSP and Cattail Coverts, labels fixed choices and hides their arrows. Falconry launches in 3D. |
| The field showed a shotgun and gun instructions. | `assets/goshawk.ts` supplies a procedural juvenile hawk and glove, animated wings and a blended landing. `audio.ts` adds a wingbeat; `fieldInterface.ts` supplies falconry instructions and hides gun and property options. |
| Flushed birds only faced the shotgun interaction. | `game/falconry.ts` and the 3D falconry adapter add visible target selection, one-quarry commitment, chase, swept interception, quarry evasion, escape, recall and return. |
| Downed birds entered dog retrieval. | `held` quarry waits for a nearby handler with the dog settled beside the hawk. Shared hunt rules prevent duplicate credit and premature completion; dog search remains held during the flight. |
| The HUD counted shells and shotgun results. | `huntHud.ts` reports flights, catches, recoveries and falconry field notes, with point and recovery guidance. |
| There were no hawk controls. | `falconry.css` and the adapter add state-aware Slip, Recall and Watch buttons, polite live status, numeric alignment, focus outlines, 40-pixel targets, 0.96 press feedback and explicit transitions. The card moves aside on short landscape screens. |
| The handler had only free camera control. | `player.ts` supports optional hawk watching from the handler's position. Gun input and model construction are disabled for falconry. |
| No falconry regression or playthrough evidence existed. | Ten focused tests cover the pursuit and shared hunt seams. Read-only telemetry and an ordinary-input browser script record complete flight outcomes. |

**September 13 polish**

| Before | After |
| --- | --- |
| The perched hawk showed its face to the handler and followed camera pitch. | The hawk faces the field and keeps its body upright, with scanning head turns. |
| Large rigid pieces and minimal idle motion read as a statue. | Smoother proportions, layered feather vanes, a barred tail, side-set eyes, blink joints, breathing, shifting weight and wing settling give the perched bird motion. Static detail is merged per joint and material. The glove has rounded fingers and stitched seams. |
| Recovery started a short return flight. | Within 1.35 metres, Pick up starts a 1.15-second hand reach and lift. The hawk stays grounded until lifted, the hunter pauses movement, and bag credit waits for completion. |
| The dog followed the handler while the hawk held quarry. | The dog approaches a position 2.4 metres beside the bound hawk, lies with its head up and watches. The HUD distinguishes approach from guarding. |
| The chase was driven only by built-in pursuit. | The same default pursuit remains. An optional guidance callback accepts future control intent, while common motion, collision and recovery rules stay authoritative. A copied flight subject supplies a future flight camera without exposing mutable hunt state. |

**Pursuit cutoff repair**

The shared bird renderer was discarding flying quarry at 80 metres from the hunter, a limit inherited from the shotgun opportunity. An active goshawk chase lost its target and counted a miss even while closing. Browser reproduction on the practice drill found that one-second and 1.5-second slips both missed at this boundary; the one-second flight had closed to roughly 3.6 metres.

`birdFlightLifetime.ts` now defers range and airborne-time retirement while that specific quarry is actively pursued. The hawk still owns its 12-second pursuit limit, and a bird landing in cover still escapes. Recall and unsuccessful flights continue to return the hawk. Ordinary shotgun flight limits remain unchanged. The miss message explicitly names the unsuccessful outcome.

| Before | After |
| --- | --- |
| The hunter's 80-metre cutoff ended an otherwise active chase. | The hawk can complete an interception beyond that boundary. |
| A prompt automated slip passed and hid the narrow effective window. | The browser regression covers one-second and 1.5-second reactions, left and right approaches, and a sprint-induced flush. All five produced catches after the repair. |
| Delayed flights could fail because quarry was deleted. | A 3.5-second delayed slip was verified to miss through the pursuit limit and return, with summary and restart working. |

Run `node tools3d/falconry-slip-matrix.mjs --window` or `--sides` for the input variations. `node tools3d/falconry-playthrough.mjs catch 61 --practice --slip-delay-ms=1000` exercises recovery after a longer flight. Tests use ordinary keyboard and mouse input; telemetry assists approach navigation, and exact airborne aiming is a separate explicit case. The browser frame-limit override is diagnostic, not performance evidence.

The full one-second-slip playthrough also completed dog guarding, refusal to recall off quarry, the handler walk-in, hand pickup, summary, and both restart routes. The lifetime regression first failed under the original cutoff, then passed with the fix. The full suite passed 103 files and 767 tests; the production build passed with the existing bundle-size advisory.

**Reference-based goshawk visuals**

The pale cream-and-taupe reference direction keeps the bird readable against the dark Cattail Coverts vegetation. Stronger longitudinal breast and nape markings borrow the contrast of the fourth reference. This remains a stylized procedural model, with no pursuit or catch tuning changes in this pass.

| Before | After |
| --- | --- |
| Round head, bulky facial pieces and a separate-looking collar. | `assets/goshawk.ts` uses a lower elongated crown, narrower neck, small lateral eyes, slim eyebrow, cere, nostrils and a continuously tapered hooked beak. |
| Broad flat brown feather pieces. | Curved overlapping vanes follow the body surface, with cream margins, taupe mottling, darker breast and nape streaks, fine shafts and barbs. Textured underlying surfaces fill gaps between feathers. |
| Folded wings read as broad plates. | Tapered wing shells carry staggered coverts and long primaries. Primary feathers fan through GPU morph targets during flight. |
| Shorter blunt tail detail. | Twelve overlapping barred feathers form a long closed tail with a rounded end. |
| Simplified legs and feet. | Feathered thighs, scaly yellow tarsi, three forward toes and a rear toe, curved talons, anklets and short jess ends refine the grip. |
| Larger idle movements and rigid feather surfaces. | Subtle breathing, weight shifts, head scans, blinks, tail balance and wing settling animate articulated groups; static detail stays merged per joint and material. |
| Nearby grass could cut through the held hawk. | `subsystems/falconry.ts` renders the held hawk and glove after clearing world depth, retaining their own self-occlusion and field lighting. Flying, grounded and lifting hawks remain in the world depth pass. |
| The renderer had one pass and reset its counters per render. | `engine.ts` supports an optional overlay pass and counts all passes within each frame, including paused redraws. The lifecycle test verifies ordering and counter reset. |
| Inspecting the bird required entering a hunt. | `tools3d/goshawk-review.html` offers rotation, zoom, back/side/front views, perched/flight poses, motion playback and a direct practice link, with keyboard focus, pressed states and touch-sized controls. |
| No repeatable close-up image set. | `tools3d/review-goshawk.mjs` captures all three perched views and flight, with a page-error manifest under `output/playwright/goshawk/`. |

Open `http://127.0.0.1:4527/tools3d/goshawk-review.html` while the worktree preview server runs. Run `node tools3d/review-goshawk.mjs after` to capture the same model used by the hunt. The page is a development review tool, not a production build entry.

The review scene records 43 draw calls and about 102,000 triangles in the paused flight pose, compared with 35 calls and about 25,000 triangles before this pass. Those figures include the review scene, and are not a device performance benchmark. The more detailed model still needs sustained physical-device performance validation.

The production build passed with the existing bundle-size advisory, and the full suite passed 103 files and 768 tests. Studio captures had no page errors. Fresh ordinary-input practice runs verified both catch and escape: the catch stayed on quarry despite waiting and recall, the dog guarded, the handler picked up, and the miss returned empty. Both completed summary and restart checks. The field screenshot also confirms that reeds no longer cut through the perched bird. One earlier diagnostic was interrupted by a development-server reload during editing; these results come from clean reruns after edits stopped.

**Future flight views and control**

F remains a handler-position watch toggle. A detached follow camera and playable hawk are explicitly open design options, not ruled out by the hunter viewpoint. Neither mode is enabled in this slice. A future follow camera should consume `flightSubject()` and use its own render camera, preserving the handler’s physical transform for movement, range checks and pickup. A future control mode can supply `GoshawkGuidance`; common turn limits, ground clearance and catch adjudication remain in `GoshawkFlight`. Camera choice must not choose the chase outcome. Returning and recovery continue to use their own rules.

The dog’s down stay represents its protective presence. There are no attacking predatory birds or protection combat mechanics in this slice.

**Limits of this slice**

The asset, flight tuning and recovery presentation are a first playable study. There is no waiting-on mode, raptor career, husbandry system, 2D falconry, or multi-raptor roster. Pursuit uses a simplified speed and turn envelope, not a calibrated aerodynamic model. Physical phone play and sustained device performance require separate validation.
