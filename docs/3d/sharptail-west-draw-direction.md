# Sharptail western draw direction

The September 28 West Track southwest screenshot exposed a composition problem that the preceding small-landmark pass did not solve. The user rejected the early follow-up images too. This work is an experimental environment draft, not visual sign-off or a claim that Sharptail is finished.

**Art target and remaining gap**

The generated concept at `assets/source/sharptail-kit/west-draw-direction-v2.png` establishes an open prairie with a remembered foreground outcrop, a connected shallow draw, broken sage/snowberry colonies, and layered distant shoulders. It is concept art, not a screenshot. The direction question remains unanswered at this checkpoint. Its illustrated asset richness has not been achieved in the game. The current short grass still looks thin and repetitive; the close brush kit has crude faceted silhouettes; the main stone needs a more convincing fractured form; distant slope planting remains sparse. Further shader noise is not the solution to those asset problems.

The next meaningful deliverable should rebuild the western playable stretch with a coherent plant/outcrop kit and real eye-height review before expanding that treatment to the remaining property. Keep the other species' maps distinct and keep this prairie open.

**Implemented draft**

The western exterior now has staggered shoulders and a connected incision with a joining finger. Its contribution is zero throughout the playable property and its 24-yard normal-sampling collar. A separate close western draw and stone-bearing shoulder change the actual nearby walking surface; existing open-country slope, entry and route checks remain required.

The exterior mesh is still four draws. Its shared grid edges and analytic normals now agree exactly, replacing visible vertical skirts at mismatched joins. The new grid has 29,456 top-surface triangles, compared with the prior roughly 15,000-triangle exterior.

Three new solid erratics and their low brush/litter apron sit near the West Track outlook. Eight broken colonies extend the vegetation read into the draw, including outside the property. These reuse the existing shrub batch: 160 High / 96 Lightweight additional instances (19,200 / 11,520 triangles), with actual exterior terrain grounding. The existing routes and concealed-bird cover cores stay clear of stones.

Ground and middle canopy share the same crown, hollow and exterior growth fields. The canopy starts before the Lightweight close grass disappears and has a clearer common-grass body. The existing RGBA normal resource now also carries correlated stand density; its strength was reduced after the early render looked wrinkled. A new painted sward albedo and one shared triplanar granite albedo are experimental runtime assets. Each texture's prompt and source provenance are recorded in `assets/source/sharptail-kit/west-draw-v2-generation.json`.

**Evidence and limits**

`output/sharptail-west-outlook/` contains the previous build and successive ordinary-eye-height captures at property (135,495), heading242 degrees, noon, FOV70. This approximates the user's West Track screenshot, not an exact recovered save. The staged HUD can display stale heading/truck/dog state because simulation is paused; camera telemetry is authoritative for the capture. Additional directions use the same camera geometry and seed.

Tests verify shared exterior edges, bounded geometry, route grades, entry-independent contact, clear bird-cover cores, real stone collisions/shots, deterministic brush roots, meadow alignment, and texture lifecycle. These checks do not establish visual acceptance, complete-hunt quality, or phone frame rate. The last stable preview remains on4683. The active prototype is on4684; no remote publish or main-branch merge is implied.

The integrated checkpoint passed 1,349 tests in 174 files and the production build (existing chunk-size warning). Eight staged High/Lightweight views had no browser errors. Rendered triangles rose about 3.1–4.2% on High and 6.4–10.4% on Lightweight in those views; this is geometry accounting, not measured phone performance. The granite texture adds one material resource. The prototype production preview is on4685.
