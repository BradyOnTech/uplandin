# Production finish for Uplandin

The active September 27 goal is the full user-approved production roadmap: a cohesive, fully playable low-poly upland hunting game with exceptional world art, animal presentation, shooting, sound, progression and browser/mobile reliability. The goal remains active until those requirements are demonstrated in the current game. A single map pass, test count or assisted hunt cannot close it.

**Authoritative starting point**

`ba6a3f5` on `codex/mobile-playtest` contains the September 22 regional work. Its preserved production artifact is `output/world-2dbe5dc`; the September 27 session restarted that artifact on port 4604. Current source development uses port 4605. Do not replace a frozen artifact behind a playtest link. Preserve unrelated assets, runtime output, 2D/falconry work and existing career saves.

The existing species doctrines, authored habitat, touch shooting assistance, field notes, regional wind/audio and offline update behavior are implemented foundations. Earlier playthroughs establish natural encounters with assisted legal shooting and recovery. Physical-phone performance, ordinary shooting enjoyment, final dog quality and whole-route composition remain incomplete or unverified.

**Completion requirements**

| Requirement | Evidence required before completion | Current state |
| --- | --- | --- |
| Finished properties | Connected arrival/search/point/flush/recovery/return routes look intentional in motion at ordinary eye height, across entries and relevant light; Quail, Cattail, Chukar and Sharptail retain distinct territories. Every offered production property must meet an explicit quality review. | Four core maps have foundations and bounded reviews; whole-property acceptance remains open. |
| Engaging hunts | Multiple ordinary hunts give meaningful wind/terrain/cover decisions, varied presentations, sensible quiet periods and reachable recoveries; differences survive without doctrine labels. | Shared species behavior works; broad rhythm and unassisted quality remain open. |
| Production dog | Believable anatomy, locomotion/terrain contact, turning, scent-to-point, pickup, carry and delivery in live habitat; consistent production asset selection and an explicit quality bar for every offered breed. | Generated GSP is the chosen approach; finishing and breed consistency remain open. |
| Bird and shot experience | Readable natural near/far/crossing rises in vegetation/sky, species-specific flight/falls, coherent hands/mount/recoil/reload and learnable desktop/touch lead. | Functional shot and recovery evidence; final animation/readability and human input acceptance remain open. |
| Convincing sound | Auditioned foreground/background mix across headsets, laptop and phone speakers; spatial launch/dog/wing/shot/recovery cues; no duplicate loops or interruption defects. | Regional synthesis and lifecycle checks pass; perceptual mix remains open. |
| Complete player flow | Clear preparation, first-hunt help, meaningful career/dog progress, earned unlocks, useful history, understandable settings and a next outing; save preservation. | Native 3D preparation, career results and journal work on the frozen third candidate. Optional first-hunt guidance and recoverable controls are implemented in `791f21a`; natural teaching effectiveness and meaningful longer-term progression remain open. |
| Browser/mobile production | Stable 60 FPS supported desktop / 30 FPS supported phone targets, defined devices, sustained thermal/loading/replay checks, accessible touch UI, HTTPS release and actual installed/offline/background checks. | Instrumentation and local browser evidence exist; device and hosted acceptance remain open. |
| Repeatable finishing process | Shared asset palette/scale/material/grounding/LOD/export standards, scoped ownership, before/after motion evidence and stable integrated checkpoints. | Existing kits and adapters are the base; final standards and acceptance must be consolidated. |

Targets are proposed acceptance requirements, not measured promises. Confirm target phones when available; do not block independent implementation on missing device access or claim physical acceptance from emulation. Hosting destination remains to be selected before publishing.

**First production wave**

| Owner | Work | Reserved source |
| --- | --- | --- |
| World worker | Sharptail landform-led vegetation masses and connected route composition, preserving geography and habitat | `sharptailMeadow.ts`, `sharptailSward.ts`, Sharptail-only `grass.ts` and `propertyTerrain.ts` branches |
| Gameplay worker | Reproduce and correct the largest demonstrated search/encounter pacing defect without hidden-target routing | `src/game/dog.ts`, focused coverage tests |
| Character worker | Generated GSP terrain support and restrained motion weight with contact/silhouette review | `generatedFieldMotion.ts`, generated presentation helpers and focused tests |
| Coordinator | Fresh visits/replays on every map, consistent generated GSP selection, truthful career awards/unlocks/season transition, integration and review | `boot3d.ts`, `gameplayMode.ts`, `huntHud.ts`, `fieldNotes.ts`, `fieldInterface.ts`, `field.css` and focused tests |

Run focused checks when each package is ready, then one combined suite/build. Serialize GPU captures and use explicit seeds in matched views. Record ordinary input, assisted input, staged poses and synthetic UI fixtures separately. Final source commits contain intentional production/docs/tests only.

**Next waves remain in scope**

Continue through whole-route world acceptance, bird/shot presentation, sound audition and mix, preparation/onboarding/career history, asset standards, remaining production breeds/properties, device performance, hosted installation and release readiness. Reorder by observed player impact, but do not redefine the goal around whichever checks are easiest to pass. Keep a visible playable checkpoint while unfinished work continues.

**September 27 implementation checkpoints**

The first combined artifact is `a0b51a6` at `output/production-wave-one-candidate` on port 4606. It adds reachable local Sharptail search sections, generated-GSP slope/turn support, landform-led meadow vegetation, fresh seeded visits/replays on every property, consistent generated-GSP selection, and actual career awards/unlocks in 3D field notes. It passes 983 tests and the production build.

Two West Track Sharptail hunts on that artifact reached natural points and rises. Seed 1184004868 resumed searching after an unshot covey escaped; seed 314159 completed a legal assisted shot, pickup, delivery and replay. Across 1,498 sampled dog frames there were no leg-reach clamps; 101 carried-bird samples stayed on the mouth attachment. These are bounded functional/contact results. Distant point/flight readability and close dog anatomy remain unaccepted; the second run does not demonstrate human shooting comfort. Evidence: `output/encounter-quality-review/browser-a0b51a6/review-summary.json` and the associated videos/contact traces.

The second integrated candidate is `cf44330`, `output/production-wave-two-candidate`, served on port 4607. It passes 1,000 tests across 131 files and the production build. Its changes are:

| Commit | Player-facing change | Evidence and limit |
| --- | --- | --- |
| `6097f55` | Sharptail grass fades into its local meadow color; filtered distant ground detail continues beyond the close vegetation. | Twelve matched High/Lite surface views show removal of the pale fade ring with exactly unchanged draw/triangle counts. Distant hills remain too smooth. A low-fan geometry prototype was rejected for angular flecks and removed from runtime. |
| `fefce7e` | Species-sized resting/carry poses, relaxed head and hanging wings, a short pickup pose blend; spatial non-pheasant launch sounds at actual takeoff. | Close carry gallery reviewed across Sharptail, Quail, Chukar and Pheasant; no added draws. Morph attributes add about 255 KiB of shared CPU data. Twelve offline stereo renders establish direction/distance, finite output and a bounded four-voice covey mix with peak 0.659. Ordinary final-build retrieval and perceptual listening remain pending. |
| `b440728` | The Closer touch sight accounts for wide phone aspect ratios. | At 844×390 it uses about 49.6° vertical / 90° horizontal FOV, approximately 20% more projected target size than before. Portrait/tablet and Wide settings retain their existing view; actual touch-event tests preserve optical sensitivity. Natural moving review remains pending. |
| `cf44330` | Landscape career results place awards beside the hunt summary; season instructions precede optional progression detail. | Three dev menu flows passed with visible career headings before the final season-text reordering. Final production layout/season guidance review remains pending. |

Raw surface evidence is under `output/sharptail-meadow-review/`; carry comparison and budget are under `output/production-bird-carry/`; stereo WAVs and metrics are under `output/production-wave-two/flush-audio-final/`. These generated artifacts are intentionally separate from source commits. Test/build logs are `/tmp/uplandin-production-wave-two-tests.log` and `/tmp/uplandin-production-wave-two-build.log`; the existing large-bundle warnings remain.

**Completed second-candidate follow-through**

The pending checks above subsequently passed within their stated limits. The natural Sharptail touch-input hunt on port 4607 reached a point, natural rise, legal assisted release shot, physical pickup and delivery. All 68 carried-bird samples stayed on the mouth attachment. Return and offer samples had no reach clamps; one initial heel sample had a 1.96 cm transient target error. Pickup happened about 51 yards away, so this does not establish close pickup quality. The natural Chukar and Sharptail optical reviews confirmed the wide-screen projection change, portrait behavior and cancel action; long-range acquisition remains difficult. The final three landscape career flows passed on `cf44330`.

A complete Sharptail circuit covered 1,991 m in 511.47 seconds through South Gate, Line Shack, the east return and South Gate, with 88 route waypoints and no runtime errors. Maximum sampled eye-height deviation was 0.018 m from ordinary bob. This was keyboard traversal at 844×390, not a physical-phone performance test or a complete hunt. West Track was reviewed in staged views but its spur was not traversed. The circuit shows that too many views still repeat the same grass foreground and smooth horizon.

Evidence is in `output/mobile-sight-review/combined-sharptail-prairie/combined-summary.json`, the adjacent contact review, `output/mobile-sight-review/optics-review-summary.json`, `output/production-wave-two/flow-final/report.json` and `output/sharptail-meadow-review/final-circuit-lite/`.

**Third integrated candidate**

Source `528ed44` is frozen at `output/production-wave-three-candidate` and served on port 4608. Its production build passes. The combined automated suite passes 1,033 tests in 135 files; the final UI draft/focus adjustments also pass browser review and the production TypeScript build. The existing large-bundle warnings remain. Logs are `/tmp/uplandin-production-wave-three-tests.log` and `/tmp/uplandin-production-wave-three-build.log`.

| Commit | Player-facing change | Evidence and limit |
| --- | --- | --- |
| `a65fc17` | A field journal records the latest 30 actual career hunts, with date, property, dog snapshots, recovered birds and awards. | Existing totals are preserved without fabricated history. Empty, legacy and 30-entry portrait/landscape dialogs pass save, scrolling and focus checks. Quick hunts leave career history untouched. |
| `42159ef` | Chukar has an authored low-poly body, face necklace, barred flanks, rounded wings and short tail; the carry pose folds correctly. | 24 matched landscape flight frames and close anatomy comparison reviewed. Three draws and 843 triangles; existing physical span, scale and hit centers remain. At 844×390 the bird is still only about 8×5 pixels at 47 m, so improved anatomy does not close mobile acquisition. |
| `dfce006` | Sharptail grass has slimmer bowed leaves and low curled litter; distant meadow shading follows connected areas of bent grass. | 18 matched High/Lite views, 13 focused tests and a 33-second ordinary-input walk pass. No added draws or triangles; one additional 512² normal texture, about 1.33 MiB with mipmaps, and one shader sample. This improves surfaces, not the unresolved plain landform composition. |
| `528ed44` | Native 3D preparation connects property/entry selection, dogs, equipment, Quick Hunt, Career, calendar actions, gun rack and journal to the next hunt. | Fresh career, Quick, season-end, older saves, cross-tab changes and full storage checked in disposable profiles. Production UI tests cover preparation, launch, actual settlement, return, portrait/landscape results and the 30-entry journal. No human shooting or physical-device acceptance is implied. |

Preparation uses the existing career rules rather than inventing a second progression system. Initial dog/home setup saves atomically; browsing and journal reading do not save. Launch validates the current save, preserves newer progress from another tab and never advances the calendar or awards XP. Failed storage keeps the draft visible. Existing 2D selection behavior is retained. The production precache includes the new preparation page, but installed/PWA entry and first-install behavior still need the hosted acceptance pass.

Third-candidate evidence is in `output/production-wave-three/preparation-reviewed/report.json` (five development edge cases), `output/production-wave-three/preparation-production/report.json` (three packaged preparation flows), `output/production-wave-three/flow-production/report.json` (four packaged results/journal flows), `output/chukar-bird-design/acceptance.json`, and `output/sharptail-meadow-review/normal-and-plant-pass.md`. Generated evidence stays outside source commits.

**Next substantial work**

1. Give Sharptail distinct terrain-led compositions across the connected route: recognizable swales, brows, shoulders and exposures. Additional noise or scatter alone will not solve the repeated smooth views. Any height changes must remain authoritative for ground contact, movement and map rendering.
2. Finish close dog anatomy, turning, gait transitions and pickup/delivery in ordinary habitat, then establish consistent quality for every offered breed.
3. Teach the first hunt through brief contextual actions, especially on touch where the desktop guidance is hidden. Preserve quiet scenery and species strategy; avoid another persistent block of controls.
4. Establish bird acquisition and shooting comfort with ordinary human input at typical near/middle/far ranges. Assisted successful shots are functional evidence only.
5. Complete whole-property art and hunt-rhythm reviews, subjective sound mixing, physical-device performance and hosted installation/offline acceptance.

The older production-slice and Pheasant-goal documents are evidence records, not current deferrals. The full goal remains active. This candidate is a playable checkpoint, not an accepted AAA release.

**Subsequent recovery and guidance corrections**

`fc4b17d` fixes the secondary dog's carry-renderer lookup: the legacy renderer registered `dog-2`, while recovery requested `dog2`. The shared `dogRendererId` now covers primary and brace registration in both renderers and bird recovery. A regression exercises the actual registration contract; it does not establish a full ordinary brace hunt.

`0c487e7` corrects resting Chukar size and attaches legacy Setter carries to the animated muzzle rather than a ground-relative chest offset. Chukar resting scale changes from 1.4 to 1.175; airborne scale, hit centers and flight physics stay unchanged. Staged top/side/quarter images accept the size and attachment correction, but the mouth still needs an actual articulated grip. Evidence is under `output/chukar-bird-design/`.

`791f21a` adds one optional contextual field tip, persistent learned/seen progress, disable/reset preferences, and recoverable controls in Pause. It hides coaching while mounting, shooting, paused or viewing the map. Three actual browser UI cases cover landscape touch, portrait touch and desktop drag-look fallback, with preference persistence and pause input isolation. Natural point/rise/recovery teaching effectiveness remains open. Evidence is `output/field-guide-review/report.json`.

The combined suite at these checkpoints passed 1,052 tests in 137 files. The current source is newer than frozen port 4608; its corrections must be packaged into the next immutable preview before reporting them as present at that play link.

The bundled Chrome 148 subsequently stalled on the unchanged frozen build and a minimal independent scene. Isolated installed Chrome 153 with default headless settings rendered both normally. New visual evidence records that browser, and a same-frame world control confirms the baseline appearance. No game startup workaround or operating-system setting change was retained.

**Current production priorities and honest coverage**

1. Finish Sharptail's physical landforms together with terrain-aligned vegetation masses and distant face structure. The intermediate height package improves the lower crossing and Shack bowl, but remains unaccepted for whole-route art. Preserve ecology, routes and authoritative ground contact.
2. Finish one generated GSP in close natural motion, including a real jaw interaction, then unify coats and brace presentation before extending anatomical families. Eleven selectable gameplay breeds currently share only two anatomical visual families; nine use Setter anatomy. A breed menu is not proof of breed-specific art.
3. Finish airborne bird acquisition and final-swing control response on actual phone/laptop input. Keep diagnostic material comparisons, automated assisted shots and ordinary human acquisition as separate evidence.
4. Review complete species-specific outings, perception of sound, long-term progression and every production property's full route. Close supported-device and hosted-installation requirements on actual devices.

Sharptail's generated landform concept lives in `assets/source/sharptail-kit/`, with its exact prompt and provenance. It is an art reference, not a runtime screenshot or a shipped texture.

**Fourth-wave control and shadow checkpoints**

`ae9d81a` applies the final touch-release coordinates before firing. A trusted browser touch sequence confirms that the last 14 px / -6 px release movement turns the camera before exactly one shot, rather than firing along the previous pointermove. `810f167` also applies desktop mouse turns to the camera immediately, covering pointer-lock and drag fallback before the next animation frame. Neither change alters assistance, difficulty or pellet physics.

`ffc050d` filters Lightweight directional shadows at the existing 1024 resolution and retains the 200 m coverage. An actual GSP/SkySystem comparison rejects the coarse Basic shadow outline and confirms that narrower coverage alone does not solve it. The rig now follows local ground on every property and snaps its center in light-space texels; actual shadow-matrix tests reproduce and eliminate fractional-texel movement on both quality tiers. Controlled frozen-4608 comparisons across four properties preserve draw, triangle and texture counts. At 844×390 on desktop Chrome 153, the later paired median GPU samples add approximately 0.12–0.16 ms for filtering. At the actual Lightweight pixel budget of 1412×652, the cost is materially larger in dense cover: Cattail adds 1.45 ms (5.37→6.82 ms), Quail 0.57 ms, Chukar 0.18 ms and Sharptail 0.14 ms. These are measured desktop tradeoffs, not physical-phone acceptance. Evidence is `output/shadow-quality-review/world-cost.json` and `world-cost-retina.json`.

The first integrated art-review artifact is frozen at `output/production-wave-four-art-review-1`, localhost port 4610, with build ID `810f167-art-review-1`. It contains in-progress world, jaw and wing packages as well as the committed corrections. All 351 input fingerprints matched before/after its successful production build; `output/production-wave-four-review-source.json` identifies the exact source. The corresponding suite passes 1,071 tests in 141 files. An initial discovery failure came from an output-only draft test copy; that artifact was preserved as `.txt`, and the normal test command then passed.

Port 4610 is an evaluation artifact, not the next accepted release. Its first Sharptail mass treatment was rejected: crown grass looked cropped/bare and the distant faces remained too smooth. Preserve that evidence while revising the authored vegetation volumes and route composition. Do not publish the review build as proof that the prairie is finished.

**Fourth-wave animal and integrated review**

`c351479` adds an articulated lower jaw and species-sized grip through pickup, carry and delivery. The single high-detail skinned mesh grows from 2,240 to 2,380 triangles without another material or draw. Four-species staged front/side views and close jaw transitions establish the bounded grip improvement. A natural Chukar hunt on frozen 4610 reaches point, rise, assisted legal shot, pickup, carry, delivery and replay without page errors. Its 319 sampled dog frames contain no contact clamps; all 49 carried samples stay on the mouth attachment. Pickup occurs approximately 52 yards away, so close bite contact remains unverified. Evidence is `output/generated-gsp-mouth/` and `output/mobile-sight-review/jaw-4610-chukar-ridge/`.

`685e2b9` interpolates authored Chukar and generic Quail wing motion between fixed updates. Matched motion captures establish removal of held poses; flight physics and shot timing remain unchanged in this commit. The later uncommitted position/shot package separately interpolates the bird's center and samples travelling shots on the same presentation timeline, beginning a fall at the actual swept impact. That package requires its own natural review before acceptance.

A trusted pointer-lock browser check on frozen 4610 confirms that a 406 px / −23 px mouse movement turns the camera before one legal keyboard shot, consuming exactly one shell without page errors. The earlier integration regression covers the pre-animation-frame ordering. Evidence is `output/shadow-quality-review/desktop-input.json`.

The next evaluation artifact is `output/production-wave-four-art-review-2`, localhost port 4611, build ID `685e2b9-review-2`. It is built from a separate source snapshot of committed HEAD plus 20 explicit world, GSP consistency and flight/shot files. All 950 source fingerprints match after the successful build; `output/production-wave-four-review-2-source.json` identifies them. The snapshot passes 1,086 tests in 143 files. Logs are `/tmp/uplandin-wave-four-review-2-build.log` and `/tmp/uplandin-wave-four-review-2-tests.log`.

The second world review retains a useful physical composition improvement: the Line Shack sits lower between rising shoulders. Both coordinator and world reviewer reject final art acceptance because foreground bunches still read as cropped fans and the middle-distance vegetation dissolves into smooth slopes. The next world package addresses plant geometry and the near-to-middle-distance transition; further color/density tuning alone is insufficient. Full-route acceptance remains pending. Port 4611 is an evaluation artifact, not the accepted fourth release.

`967526b` uses the generated GSP for all four coats and either dog slot, with independent posture, attention, mouth attachment and audit ownership. Sixteen staged High/Lite noon/lastlight views confirm shared anatomy and distinct pigment; lastlight detail remains strongly silhouette-led and is not accepted as final animal readability. In a natural 4611 two-GSP Chukar hunt, the black-roan primary points and retrieves while the liver-roan secondary honors and marks independently. Each dog has 256 sampled frames without contact clamps; all 48 carry samples remain on the primary's mouth. The full point/rise/assisted-shot/retrieve/delivery/replay path passes without page errors. A second-dog natural retrieve did not occur; the pooled integration regression covers that attachment contract. Pickup is 22.5 m away and the review driver keeps its aim too high during return, so this run does not establish close interaction quality. Evidence is `output/generated-gsp-brace/` and `output/mobile-sight-review/brace-4611-chukar-ridge/`. Nine other gameplay breed profiles still reuse Setter anatomy.

`8d43a4b` completes the position/shot timeline package. Controlled Chukar and Sharptail crossings at 60 Hz remove the held-position frames, reducing the largest displayed step from 0.6 m to 0.3 m while preserving the authoritative trajectory and size. A natural Chukar hunt on 4611 reaches point, rise, assisted touch shot, falling bird, retrieval, delivery and replay without page errors. The coordinator reviewed the moving-position sheets and actual impact sequence. Evidence is `output/bird-readability-review/position-flight-acceptance.json` and `flight-acquire-4611-chukar-ridge/`. Ordinary human acquisition remains open.

The first delayed-shot driver missed because its firing thumb saturated at the screen's right edge; camera bearing lagged the intended shot by about 20 degrees. That result is preserved under `flight-4611-chukar-ridge/`. It is a control-travel limitation, not evidence for changing pellet physics or increasing forgiveness. The successful follow-through used ordinary looking before mounting, then a legal touch release.

**Third art review and screen-edge controls**

`output/production-wave-four-art-review-3` on localhost 4612 is an immutable evaluation build, ID `8d43a4b-review-3`. It contains committed flight/coats plus 13 explicit world files and five touch-control files. The production build passes and all 952 snapshot files remain unchanged; `output/production-wave-four-review-3-source.json` records them. A subsequent source-only shared-wind correction is deliberately absent from this artifact.

The third prairie treatment adds substantial bunchgrass and a ground-conforming middle layer. High/Lite views confirm the increased volume, but both reviewers reject final shape acceptance: close leaves resemble stiff crop blades and middle groups read as isolated pale dashes. The next revision retains the useful terrain and cullable infrastructure while changing near bunch silhouettes and connecting middle-distance sward. Do not claim full-world acceptance from the new geometry counts.

`b24f24f` continues a held swing at a screen edge, using the existing optical/sensitivity response. Outward touch movement arms it; inward movement, Lower, cancellation, pause and disposal stop it. Its contextual hint replaces the existing status line, and Pause explains the gesture. The failing regression reproduces the previous zero-travel limit; 46 related checks now pass, covering all four edges, 30/60 Hz consistency, interruption, another finger and delayed frames. Trusted browser input compares frozen 4611 and 4612: a 450 ms hold turns zero additional degrees before the change, about 43 degrees in landscape afterward, and 58 degrees in portrait. Inward movement produces no continuing drift; release consumes exactly one shell, with zero page errors. The initial driver sampled before Chrome delivered a coalesced pointermove; the final driver waits for the trusted event. Evidence is `output/touch-edge-review/`. This proves control reach and lifecycle, not physical-phone comfort.

The identical delayed, continuously held Chukar route subsequently succeeds on frozen 4612 with the first legal assisted shot, retrieval, delivery and fresh replay. All 29 recorded control events are trusted; the final release bearing matches the requested lead after the formerly saturated hold. The driver retains the original route and assistance. Evidence is `output/bird-readability-review/edge-flight-acceptance.json` and `edge-4612-chukar-ridge/`. This resolves the demonstrated screen-edge limit while leaving human comfort and physical-phone acceptance open.

**Fourth playable checkpoint and grounded pickup**

The accepted fourth checkpoint is committed `b24f24f`, frozen at `output/production-wave-four-candidate` and served on port 4609 with LAN access. All 950 source hashes match the candidate manifest after its successful production build; the suite passes 1,098 tests in 143 files. The existing large-bundle warning remains. A disposable-profile native preparation check selects Chukar, changes dog, brace, equipment and conditions, launches the actual field, ends through results and returns to preparation without page errors or changes to the career save. Evidence is `output/production-wave-four/preparation-production/report.json`. This checkpoint contains the accepted coat/brace, jaw, flight, shadow and input work; it excludes the later pickup, installed-preparation and unaccepted landscape drafts.

`58279c0` makes a generated dog's pickup reach the reserved bird's actual grounded presentation centre. A supported chest lean and bounded residual neck reach keep the paws planted; slope-aware head angle and a small approach arc prevent the nose/lower jaw from entering the ground. The coordinator reviewed the corrected staged gallery and moving before/after frames. On the staged Chukar approach, the settled grip gap falls from about 23 cm to 2.85 mm; carried attachment remains exact. Both versions retain the same single pre-existing contact clamp in the prescribed turn. The actual skinned nose/jaw checks cover four species and flat, ascending and descending slopes; 25 related tests in three files and TypeScript pass. This accepts the bounded pickup correction, not final anatomy, ordinary close hunting interaction or every breed. Evidence is `output/generated-gsp-brace/pickup-moving-report.json`, its recording, and the clearance reports.

The fourth world evaluation is frozen on localhost 4613 as `b24f24f-review-4`, from 952 fingerprinted files with 13 explicit world overlays. Its production build passes. Four matched High/Lite views show improved near leaves and removal of the previous pale distant dashes, but the broad slopes remain too smooth and Lightweight has conspicuous near gaps. The canopy uses a separate smooth material that covers the underlying terrain detail; its visibility and terrain intersection are being diagnosed before another art revision. Whole-route acceptance remains open. The review build must not replace the accepted checkpoint.
