# Regional polish blitz

The September 22, 2026 regional polish checkpoint is `be64317`. It preserves Quail's accepted warm bobwhite country, builds on the recent Sharptail grass/habitat/Line Shack work, and improves the Sharptail bird itself. The final production artifact is `output/blitz-be64317`, served locally at `http://127.0.0.1:4602` and on the same network at `http://192.168.0.138:4602`. The matched baseline is `605e46d` on port 4600; the first combined candidate `a9be754` remains on 4601. These are local previews, not a public deployment.

The final checkpoint passes 124 test files / 950 tests and the production build. Twenty matched High/Lite environment views completed without browser errors. Review accepted the Quail and Sharptail changes and found a distant Chukar soil-filtering defect; eight final Chukar stills confirm the correction in both tiers. The art pass is ready for playtesting. This record does not declare whole hunts or physical-phone performance complete.

**Integrated work**

| Commit | Player-visible change | Preserved boundary |
| --- | --- | --- |
| `8e90a61` | Quail tracks use subdued soil/vegetation values with varying wear; twelve localized grass aprons connect the entry, drainage and windmill plum edges. | The track footprint, terrain fitting, route network, woody silhouettes and hunting habitat are unchanged. No new asset or material type; distant cover adds 288 triangles within its existing 5,000-triangle bound. |
| `9a0ac23` | Sharptail gets a compact buff/brown body, pale belly and undertail, graduated tail, rounded wings and folding recovery stroke. The initial group rises together, with an occasional later bird; powered beats settle into short bouts and glides. | Species size, flight physics, hit center and shooting rules remain unchanged. Animation uses the interpolated flight clock. Subsequent seeded random draws retain their sequence. |
| `9effb74` | Chukar grass and sage form more coherent cured-straw/silver-sage groups; mineral soil, plant beds and irregular contour tread better connect vegetation to the slope. | This is presentation work, not new terrain height, route coordinates or hunting habitat. Surface detail is filtered with distance/derivatives. |
| `598e1a1` | Quail's distant wooded crowns have unequal rounded lobes and less of a bright base band. Sharptail's camera-following horizon is drawn behind the real terrain and distant props. | The existing regional identities and playable geography remain intact. Quail's backdrop uses 384 additional angular segments across its first two bands. |
| `a9be754` | Tightens the Sharptail recovery-geometry test to assert its morph target exists before inspecting it. | Test-only change; no runtime difference from `598e1a1`. |
| `fd3866c` | Filters Chukar soil variation when grazing-angle pixels cover multiple noise cells, addressing distant ripples found during review. | Resolved foreground detail remains; no additional geometry, textures or draw calls. |
| `be64317` | Escaped Sharptail continue visibly along their flight path rather than immediately disappearing at 80 metres. | Escape credit and shooting eligibility are unchanged. Decorative birds stop at ground contact, 180 metres or six additional seconds; live launches reclaim their slots within the existing pool. Other species and active hawk pursuit retain their behavior. |

This wave follows the `605e46d` Sharptail environment baseline: compact irregular sage volumes, composed habitat pockets, lower grass mats, softened habitat clearings and the weathered Line Shack. Those improvements are retained rather than rebuilt. Quail is open for bounded polish again; its earlier acceptance remains an art-direction constraint, not a prohibition on refinement. Cattail Coverts remains the accepted environment benchmark and is outside this redesign scope.

**Evidence available**

Environment screenshots and JSON telemetry are in `output/blitz-polish-wave2`. The harness records morning light, seed `1184004868`, ordinary FOV 70, High at 1440×810 and Lite at 844×390. It stages four Chukar positions, three Quail positions and three Sharptail positions; these are scene inspections, not evidence that a player walked the whole circuit. Baseline files start with `before-605e46d-`; candidate files start with `candidate-a9be754-`.

The reviewed Quail High/Lite stills show a less conspicuous track center and more connected grass around the drainage and windmill plum. Broad warm soil, open dog-casting room and dark southern-plains cover remain legible. The drainage's wheel stripes are still fairly continuous. A separate ordinary-input Lite entry walk advanced 33.1 metres and returned without errors or obstruction; its images and video use the `candidate-quail-walk-lite` prefix. This short route exercises entry vegetation transitions, not a complete hunt.

Sharptail's false pale horizon strips are absent in matched candidate views; the real prairie ground now remains visible in front of the distant backdrop. Chukar's sage and grass are fuller while the contour tread is less conspicuous. The Chukar review identified fine distant ground striping rather than accepting the images solely because rendering succeeded. Final High/Lite west-return and south-bench views confirm that `fd3866c` removes these ripples while retaining resolved foreground detail. Final Chukar files start with `final-be64317-`. A separate ordinary Lite West Track walk/return also passes without browser errors; its evidence starts with `walk-be64317-lite`.

Matched environment cost is recorded in `environment-cost-comparison.json`. Sharptail environment triangles and draw calls are unchanged. Chukar submitted triangles fall 5.69–11.47% in High and 0.63–0.73% in Lite, with unchanged draw calls. Quail High ranges from −0.27% to +4.08% triangles and −2 to +1 calls; Lite adds 0.40–2.52% and zero to two calls. These are scene submission counts, not physical-phone speed measurements.

Sharptail bird evidence is recorded in `sharptail-bird-review-summary.json`, the baseline/candidate bird JSON and NDJSON, gallery images, and ordinary/natural-rise MP4s in the same directory. Both ordinary keyboard/mouse runs found the same five-bird group through live dog work, walking about 94 metres before the rise. Neither reported browser errors. This is an ordinary encounter, distinct from the separate staged 12- and 30-metre bird galleries.

The bird gallery retains the ordinary lens. Its recorded cost is 350 additional submitted triangles and no additional draw calls in each matched view. Broad pale underparts and the graduated tail are visible at close range; at normal shot distances the improvement is modest and motion/contrast matter more than small feather details. The tested seed rises as a tight group; the optional late bird is supported by deterministic tests, not by this one replay.

**Acceptance and limits**

- [x] Complete the combined High/Lite environment comparison and record the concrete Chukar filtering regression.
- [x] Confirm the Chukar filtering correction in a new frozen build and exercise an ordinary entry walk/return.
- [x] Identify the reason Sharptail birds leave the rendered pool about two seconds after this natural rise: the 80-metre escape cutoff hides birds that are still roughly two metres above the terrain.
- [x] Preserve the gameplay escape rule and verify the bounded Sharptail visual departure through regression checks and a seven-second ordinary encounter recording.

The final Sharptail replay follows the dog for 94.1 metres to a natural five-bird flush. Five unique bird IDs receive exactly five escape credits, with a stable tally afterward. Eligible targets end at +2.34 seconds; the renderer retains the departing silhouettes, then retires them in three-draw/442-triangle steps. `final-sharptail-departure-review.json` and `final-high-sharptail-birds-natural-rise.mp4` retain the evidence. The low crest obscures or camouflages distant birds, so the recording does not establish seven seconds of clearly readable silhouettes. The staged gallery, launch recording and cadence tests support the presentation change; sustained distant readability needs a different natural sightline if it becomes a playtest concern.

Complete hunt/recovery/return acceptance remains separate follow-up work where absent. No shot or retrieve was forced to make the environmental evidence appear more complete.

The natural encounter starts roughly 40 metres away. The last observed airborne birds occur about 2.03 seconds after the first rise in the baseline and 2.29 seconds in the first candidate. Those 3.5-second video excerpts include empty frames; they do not prove 3.5 seconds of visible flight. `sharptail-flight-diagnosis.json` records the range and ground-clearance evidence: the birds cross the 80-metre lifetime boundary with unchanged 21–24 m/s velocities, well before ground contact or the 15-second timeout. A subsequent departure fix must receive separate evidence; these earlier recordings are retained honestly.

The two ordinary runs use the same seed and driver, not an identical replayed input stream; scheduling produces small differences in approach and dog timing. Instrumented video and staged telemetry are not standalone frame-time benchmarks. Lite viewport emulation does not establish physical-phone hit rate, thermal performance, touch feel, installation or offline acceptance. No new claim about those follows from this art pass.

The source and production builds are frozen while reviewed. User previews, unrelated assets and other worktrees remain separate. Future edits should respond to the combined findings before expanding into more detail or new maps.
