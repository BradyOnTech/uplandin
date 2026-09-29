# Hunt arrival, scent work, and menus

This pass addresses the September 28 playtest: a more intentional start at the truck, active dog work on distant scent, and menus that use the available screen well. The accepted covey-rise and bird-flight rules remain intact.

**Scent work**

The continuous 3D field previously spent about half a second locating regardless of distance, then followed a distant bird in an almost straight slow stalk. Controlled shared-simulation examples reproduced 17–28 seconds of stalking with only centimetres of lateral movement.

Locating now continues with narrowing casts while the source is distant. Confidence, breed, training and the property's pace shape the approach. A brief close stalk precedes locking and pointing. Moving birds can reopen locating; lost scent receives a bounded check around the last sampled position before ordinary habitat search resumes. Only live scent updates the target sample.

The dog respects the existing property leash. Where no explicit leash exists, its breed/property working radius also constrains a long scent approach. It can wait for the handler before applying the final close pressure, with a finite eight-second close-hold budget per approach and the existing waiting-for-handler cue. This does not make a point indefinite or change bird nerve.

Final stalks measured 1.4–2.2 seconds in the controlled cases. Twenty paired CPU route checks retained all eight Quail close proximity rises at roughly 11 metres and all four Chukar proximity rises at 15.1 metres. These routes use public entry paths and observable dogs, but omit renderer collision and do not establish human shooting comfort. Long runner routes still take time. One Pheasant case combines the original leash and close hold into a 10.6-second wait; Sharptail can still rise wild. Those remain useful future playtest cases.

**Arrival**

The four primary properties share a field pickup with a ventilated dog box, opening door and tailgate. Static geometry is batched: 2,292 triangles, five draws and three shared materials. Existing parking placement and collision contracts are retained.

A 3.2-second sequence shows anticipation, a step onto the tailgate, a hop down and a settled dog. A brace exits with a short stagger. Generated GSP and Setter presentations solve supported paws on the supplied platform; the shared simulation receives the grounded endpoints once the sequence ends. The dog remains at heel until the hunter moves off or casts it off.

The simulation clock is paused throughout release. Skip, interruption and reduced motion share the same grounded endpoint. Escape, blur and orientation changes return to pause; resume does not replay. The survey shortcut cannot open during arrival. Explicit imported-rig review, capture mode, falconry and properties outside the four active environments retain their existing start.

**Menus**

Preparation, the field menu, hunt results, journal and gun rack share a forest, parchment and ochre palette. Preparation separates the ground from the dog and equipment. At laptop sizes the main choices fit above a persistent departure action; secondary conditions expand when needed. The field menu scrolls its content while keeping start/resume available. Phone layouts preserve touch-sized controls and safe-area spacing.

**Verification**

- Full scoped repository suite: 1,449 tests across 185 files pass with `npx vitest run --dir test --maxWorkers=2`.
- Production build passes. The existing bundle-size advisory remains.
- New regressions cover live scent loss, runner relocation, handler holds, truck grounding and disposal, platform contact for both dogs, and exactly-once arrival lifecycle handoff using the real paused engine render path.
- Browser review covers the laptop preparation and career setup, portrait and landscape field menus, results, journal and rack, GSP release playback, Setter interruption, resume and the map shortcut guard. The packaged preparation-to-hunt launch also works.
- Browser viewport checks are not physical-phone frame-rate or touch-comfort measurements. No new device-performance claim is made.

The frozen local build is `output/review-hunt-experience`, build `64c4c32a160eebe8`, served on port 4688. Local images and review logs are in `output/hunt-experience-review`; paired dog traces are in `output/dog-scent-work`. These local output folders are not part of the checkpoint commits.
