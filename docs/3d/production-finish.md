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
| Complete player flow | Clear preparation, first-hunt help, meaningful career/dog progress, earned unlocks, useful history, understandable settings and a next outing; save preservation. | Native 3D preparation, career results and journal work on the frozen third candidate. First-hunt teaching and meaningful longer-term progression remain open. |
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
