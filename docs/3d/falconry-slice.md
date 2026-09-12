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
| E / Make in | Recover held quarry at close range, with the dog at heel |
| M / Esc | Survey map / pause |

Touch retains movement and looking on the field and exposes separate hawk action buttons. A missed slip does not automatically offer another bird. An unsuccessful flight returns the hawk; a successful one leaves it with its quarry until the handler makes in. After return, whistle to restart the dog's search.

**Implementation**

`src/game/falconry.ts` owns pursuit, commitment to one quarry, swept interception, recall, landing and handler recovery in metres and seconds. The existing 3D bird controller supplies live quarry positions and velocities; nearby quarry can jink in response to pursuit. Both advance on the existing fixed 30 Hz clock. This slice adds a shared pursuit model without moving the existing shotgun flight controller out of the 3D adapter.

A caught bird enters `held`, which the dog cannot retrieve. The hunt records the catch once, waits for handler recovery before bag credit, and blocks ending the session while the hawk is away or quarry remains held. The dog returns to heel during the flight and stays there until cast off after recovery. Shotgun construction and input are disabled in falconry.

The model and glove are editable procedural studies in `src/three/assets/goshawk.ts`. They can be replaced by a finished asset without changing hunt rules. The current bird is a juvenile with a brown back, streaked cream breast, pale eyebrow and yellow iris.

**Validation**

`test/falconry.test.ts` exercises target eligibility, geometric catches, escapes, recall, return, repeated slips, recovery distance, dog steadiness, duplicate credit, hunt completion and career isolation. The existing suite checks compatibility with shotgun hunts.

`tools3d/falconry-playthrough.mjs` drives an isolated browser using keyboard and mouse input. Read-only telemetry assists its aiming. It does not teleport the hunter, force a point, flush birds, or manufacture a catch. It saves evidence under `output/playwright/falconry/`. Its frame-limit override is a test-browser workaround; results are not a device performance benchmark or human usability study.

The complete suite passed: 101 files and 760 tests. The production build passed with the existing bundle-size advisory. The Quick Hunt picker was exercised through South Gate into 3D, including a launch from the 2D renderer preference. The field was visually checked at desktop size and at 844 by 390 pixels.

The seed-61 browser catch run completed a natural dog point, slip, catch, handler recovery, return, cast-off and field summary. A delayed slip on the same route completed an escape, empty return, cast-off and summary. An early-recall run also returned the hawk, waited for the dog to settle and the pheasant to escape, then completed cast-off and summary. All three runs verified pause and no career-save change. See the local JSON manifests and screenshots under `output/playwright/falconry/`.

**Change review**

| Before | After |
| --- | --- |
| Quick Hunt offered gun loadouts and freely adjustable companions and property. | `QuickScene.ts` adds a goshawk choice, fixes one level-10 GSP and Cattail Coverts, labels fixed choices and hides their arrows. Falconry launches in 3D. |
| The field showed a shotgun and gun instructions. | `assets/goshawk.ts` supplies a procedural juvenile hawk and glove, animated wings and a blended landing. `audio.ts` adds a wingbeat; `fieldInterface.ts` supplies falconry instructions and hides gun and property options. |
| Flushed birds only faced the shotgun interaction. | `game/falconry.ts` and the 3D falconry adapter add visible target selection, one-quarry commitment, chase, swept interception, quarry evasion, escape, recall and return. |
| Downed birds entered dog retrieval. | `held` quarry waits for a nearby handler with the dog at heel. Shared hunt rules prevent duplicate credit and premature completion; dog search remains held during the flight. |
| The HUD counted shells and shotgun results. | `huntHud.ts` reports flights, catches, recoveries and falconry field notes, with point and recovery guidance. |
| There were no hawk controls. | `falconry.css` and the adapter add state-aware Slip, Recall and Watch buttons, polite live status, numeric alignment, focus outlines, 40-pixel targets, 0.96 press feedback and explicit transitions. The card moves aside on short landscape screens. |
| The handler had only free camera control. | `player.ts` supports optional hawk watching from the handler's position. Gun input and model construction are disabled for falconry. |
| No falconry regression or playthrough evidence existed. | Eight focused tests cover the pursuit and shared hunt seams. Read-only telemetry and an ordinary-input browser script record complete flight outcomes. |

**Limits of this slice**

The asset, flight tuning and recovery presentation are a first playable study. There is no waiting-on mode, raptor career, husbandry system, 2D falconry, or multi-raptor roster. Pursuit uses a simplified speed and turn envelope, not a calibrated aerodynamic model. Physical phone play and sustained device performance require separate validation.
