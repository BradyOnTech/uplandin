# Sharptail Prairie composition refinement

September 22, 2026. The user accepted Quail Fields' visual direction and found Sharptail too basic and inconsistent with the game's style. Quail is now the fixed visual reference for this pass. Sharptail retains its own open northern prairie identity while gaining stronger terrain composition, vegetation masses, worn access tracks and a recognizable Line Shack.

**What changed**

Six rotated, elongated shoulders and two low saddles replace the overlapping broad mounds. Two shallow swales separate the south approach, western casting ground and eastern return into successive views. Shared terrain sampling drives the player, dog, grass and scenery. The 21 habitat rectangles, species mix, parking positions and seeded encounters remain unchanged.

The four authoritative routes now bend around this relief. Their rounded polylines are shared by survey, grass wear and trail rendering. Both Line Shack routes meet 18 yards south of its center, outside its existing collision footprint. New route samples remain below 20% grade; initial parking approaches stay below 12%. The authored five-yard terrain grid spans 18.65 metres of relief, with maximum grade 18.82%.

Folded basal grass leaves, separate short/medium/tall silhouettes and oblique height variation replace the thin, uniform stems. Short and medium bunches continue underneath tall stands, with occasional seed stems above. Sage-green lee ground and ripened straw shoulders form broad color groups. Existing low sage is now approximately knee height rather than nearly invisible ankle-height detail. This pass retains grass pool caps and distant-instance limits.

Wheel marks now have broken wear, soft irregular edges and a vegetated center. The former solid strip and separate sharp rut mesh become one static single-pass mesh. The painted prairie litter already shipped with the game supplies nearby ground detail through one mipmapped texture sample, fading from 18–65 metres; Sharptail keeps its own green/straw ground colors. High-frequency procedural floor noise was reduced rather than layered on top of the asset.

The Line Shack now has weathered timber, closed gables, a metal roof, stovepipe, attached shed, stored gate and buried fieldstones. Its foundation follows the actual terrain. All parts fit within the existing 7.8-metre collision circle: maximum asset radius is 7.162 metres. The merged asset uses one draw and 1,894 triangles; walls and roof block shots while surrounding sky remains clear. A dedicated Lambert material matches the response of the surrounding low-poly world and improves the morning facade's readability.

**Integration and review**

The terrain/route package was delivered by the separate map chat and integrated as `a68c443`. Grass, trails, materials and the Shack were integrated as `7e402dc`; the final color, sage-scale and Shack-lighting adjustment is `69e7914`. All new behavior is restricted to Sharptail. Quail, Cattail and Chukar's authored visuals are unchanged by this refinement.

The full combined candidate at `7e402dc` passes 120 test files / 922 tests and the production build. After the final presentation-only adjustment, 41 relevant habitat, grass, geometry and Shack checks pass, and the production build passes again. The existing large-bundle build warnings remain.

Local evidence is in `output/sharptail-refinement-review/`. The first review includes three matched morning Lite 844×390 views, the same three High views, and a close approach to the Shack. Positions are staged, at ordinary eye height and FOV 70; these are environment inspections rather than hunts. The earlier baseline is preserved in `output/regional-combined/` and `artifacts/3d/regional-identity/`.

A separate ordinary-input Lite recording starts at the actual parking place, walks forward for 16 seconds and returns for 16 seconds. It advances 33.08 metres and returns within approximately five centimetres of the starting position, without blocked movement or browser errors. It uses no camera-position setter during the walk. The 32.56-second recording and trace are retained. Sampled moving frames show continuous terrain/vegetation transitions, but do not establish absence of shimmer on a physical phone.

Two final matched captures at `69e7914` review the Lite windbreak approach and High near-Shack view. Both pass rendering guards without browser errors. The sage/straw color groups visibly reduce the bleached grass appearance. The Shack material change improves trim/roof separation only modestly in the examined morning direction; the front remains dark and that limitation is not considered resolved. No movement or terrain changed after the recorded walk.

The preserved production artifact is `output/blitz-69e7914`, with build ID `69e7914`, served on port 4597. Earlier artifacts remain intact. Source documentation commits after this ID do not change the served game.

**Remaining limits**

The first combined screenshots show materially better rolling relief and vegetation shape, with the former straight highway appearance removed. Lite still exposes open ground between grass bunches; avoiding a uniform blanket of vegetation is intentional, but more selective composition may be useful after player feedback. This is a stronger playable art checkpoint, not final environment or complete-hunt acceptance.

Near-ring source census measurements show fewer grass triangles and populated batches at the examined locations; they are not GPU timing or phone frame-rate measurements. Curved routes increased the authoritative polyline from roughly twenty to 92 points, adding distance work during grass-tile construction. Sustained physical-phone performance, full-property navigation and complete search/flush/recovery hunts remain outstanding. No bird locations or successful shots were staged to establish gameplay acceptance.

**Follow-up polish after player feedback**

The user accepted the overall prairie design but still found it too plain. Runtime checkpoints `dcb2a0e`, `3c17793` and `605e46d` keep the accepted terrain and routes while adding stronger grass assets, composed habitat, clearer light and a more grounded Shack. Quail's accepted visuals remain unchanged.

Grass now combines several interleaved roots, bowed leaves, low spent grass and localized seed stems. Twelve authored sage/snowberry, dry-forb and low-fieldstone pockets sit along shoulder lips, swales and route reveals. Their shared property-space mask both colors the underlying soil and reduces grass height/density, so grass no longer competes with every shrub at the same height. Ground color blends smoothly from dry litter into sage swales. The pockets remain decorative; bird-cover rectangles and encounters are unchanged.

A first visual review showed shrubs reading dark and getting buried by grass. Close inspection then exposed repeated umbrella-like crowns and an overly cleared oval. The final asset uses four irregular faceted foliage volumes on visible forks, at the same 120-triangle budget. Lifted shaded leaf values preserve detail; retained basal grass and an irregular shared mask break up the pocket boundary. Low stature, sparse groups and open prairie preserve the regional distinction from Quail. All stones remain below a 0.3-metre step; routes retain their existing clearance.

Sharptail's sky fill now comes from the opposite side of the key light, with stronger morning/noon fill. The formerly almost-black Shack facade retains visible siding, trim and doors. The building adds an oval stock trough, shed door and irregular worn yard. The yard follows terrain, has earthy vertex-color variation and a softer grass-colored perimeter, and is excluded from shot blockers. The Shack stays within its original collision circle and uses two merged draws / 2,426 triangles.

Lite uses 48-triangle medium grass and 94-triangle cover, compared with High's 52/102. Both retain identical outer bounds and all low litter. Distant cover uses a separate 42-triangle asset. The five habitat batches retain fixed caps, and cleanup now disposes their instance buffers as well as shared meshes/materials. No new texture downloads were added.

The release `605e46d` passes 929 tests across 121 files and the production build. Existing large-bundle build warnings remain. Local evidence and validation logs are retained in `output/sharptail-polish-review/`; these generated artifacts are intentionally not committed.

The final matched Lite 844×390 views use ordinary eye height and FOV 70. Compared with `69e7914`, actual full-scene renderer counts are 203,836→246,002 triangles at the south shoulder (+20.69%, three additional draws), 266,699→292,602 at the windbreak (+9.71%, unchanged draws), and 387,645→417,204 on the return (+7.63%, one additional draw). These are rendering-work counts, not GPU timings or phone frame rates. The slight excess above the approximate 20% shoulder target was retained for the visibly better shrub and grass composition.

High views inspected the shoulder, Shack approach and near habitat. Final close inspection confirms the umbrella crowns are gone and the pocket sits more naturally within grass. The Shack yard is warmer and better integrated, though its smooth surface remains simpler than the surrounding textured ground. Fixed-position inspection is staged environment evidence, not hunt acceptance.

Two ordinary-input Lite approach/retreat recordings, separate from staged views, cover 32.52 and 16.51 seconds. The shorter final movement check advances 15.44 metres and returns within two centimetres of the starting position, without browser errors. The last source correction changes only shrub geometry and the decorative pocket mask; it changes no terrain, collision, controls or hunting mechanics. The recordings do not establish sustained physical-phone performance or complete search/flush/recovery gameplay.

The current immutable preview is `output/blitz-605e46d`, build ID `605e46d`, on port 4600. The prior user preview on port 4597 remains intact. This completes the bounded visual-polish pass; real-device performance and full-hunt acceptance remain separate work.
