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

Open `http://127.0.0.1:4527/index3d.html?play=quick&method=goshawk&practice=slip`. This is a separate, visibly labeled practice setup on Cattail Coverts: one planted rooster about 31 yards ahead, a finished dog already in scent, a favorable breeze, frost, and balanced challenge. The fixed seed and South Gate coordinate frame keep restarts consistent. Morning is the default light.

Wait for the dog to point, walk toward it and continue in the direction of its nose, then face the flush and press Space. Press T or the in-field Restart drill button to reset at any stage; the summary also offers Restart drill. Reloading resets the whole drill. No career progress is saved.

The rooster holds rather than running and has a one-minute nerve allowance on point. The dog establishes the point through normal scent AI. Ordinary flush, pursuit, escape, guarding and hand pickup rules remain in use. The starting hunter is outside the dog's normal handler exclusion distance. Ordinary Quick Hunts and career hunts retain their original spawns.

| Before | After |
| --- | --- |
| Testing required searching the property before the first point. | The explicitly selected drill stages one nearby opportunity and casts off the dog automatically. |
| Hunt again rerolled the visit. | Practice offers a repeatable restart from the field or summary. |

`tools3d/falconry-playthrough.mjs catch 61 --practice` verified a point without hunter movement in 0.7 seconds, a slip about 9 seconds after entry, and hand pickup about 25 seconds after entry. It also verified a fresh point after the summary restart and reset through the T shortcut. The delayed-slip practice run also verified an escape, empty return, summary and both restart routes. These are automated diagnostic timings, not a device performance promise. The full suite passed 102 files and 764 tests, and the production build passed with the existing bundle-size advisory.

**Implementation**

`src/game/falconry.ts` owns pursuit, commitment to one quarry, swept interception, recall, landing and handler recovery in metres and seconds. The existing 3D bird controller supplies live quarry positions and velocities; nearby quarry can jink in response to pursuit. Both advance on the existing fixed 30 Hz clock. This slice adds a shared pursuit model without moving the existing shotgun flight controller out of the 3D adapter.

A caught bird enters `held`, which the dog cannot retrieve. The hunt records the catch once, waits for the completed hand pickup before bag credit, and blocks ending the session while the hawk is away or quarry remains held. The dog returns toward the handler during the flight. After a catch it approaches a spot beside the hawk and takes a down stay, remaining there as the hunter walks in. A whistle does not release that stay while the hawk holds quarry. After pickup, whistle to resume hunting. Shotgun construction and input are disabled in falconry.

The model and glove are editable procedural studies in `src/three/assets/goshawk.ts`. They can be replaced by a finished asset without changing hunt rules. The current bird is a juvenile with a brown back, streaked cream breast, pale eyebrow and yellow iris.

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

**Future flight views and control**

F remains a handler-position watch toggle. A detached follow camera and playable hawk are explicitly open design options, not ruled out by the hunter viewpoint. Neither mode is enabled in this slice. A future follow camera should consume `flightSubject()` and use its own render camera, preserving the handler’s physical transform for movement, range checks and pickup. A future control mode can supply `GoshawkGuidance`; common turn limits, ground clearance and catch adjudication remain in `GoshawkFlight`. Camera choice must not choose the chase outcome. Returning and recovery continue to use their own rules.

The dog’s down stay represents its protective presence. There are no attacking predatory birds or protection combat mechanics in this slice.

**Limits of this slice**

The asset, flight tuning and recovery presentation are a first playable study. There is no waiting-on mode, raptor career, husbandry system, 2D falconry, or multi-raptor roster. Pursuit uses a simplified speed and turn envelope, not a calibrated aerodynamic model. Physical phone play and sustained device performance require separate validation.
