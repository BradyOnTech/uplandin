# Sharptail connected ground and vegetation

**Scope**

This pass addresses the isolated shrub colonies and smooth ground in the western view from West Track. It preserves the accepted clouds, playable landforms, hunting habitat, and other maps. It is an art iteration, not final approval of Sharptail.

Exterior shrubs previously followed the analytic heightfield rather than its rendered triangle mesh. At the outer fork their roots were up to approximately one metre above the visible ground. The horizon builder and plant placement now share the same Float32 grid and triangle interpolation. Shrub footprints follow those planes while stems stay upright; their wind transform accounts for the resulting shear.

**Visible changes**

- Shared grass, scrub, and litter bands connect the western colonies. Low fringe growth and two approaching sage colonies bring this structure closer to the normal hunting view, with grassy breaks between crowns.
- Instanced grass replaces the raised middle-distance sheet. Dense grass follows the bands and continues outside the western map edge. The open shoulders retain shorter, sparser cover.
- Grass roots fit both displayed interior terrain levels and the actual exterior triangles. Narrow blades and sky fill prevent dark, wing-like silhouettes. Shrub undersides also receive sky fill, and reduced crown spread avoids flat overlapping roofs.
- Ground treatment follows the same vegetation bands. Fine shading fades before it becomes unresolved at grazing angles, removing the horizontal ripples seen during review. The extended ground no longer enlarges the straw atlas into long streaks.

**Verification**

The production build and TypeScript pass. All 1,398 tests across the 179 repository test files pass with `npx vitest run --dir test --maxWorkers=2`. The directory restriction excludes old source snapshots under `output/`; two workers avoid contention during the geometry-heavy checks. Coverage includes rendered triangle contact, both entries and quality tiers, colony continuity, physical clearances, submitted grass budgets, disposal, and actual shrub wind shader math.

Desktop Chrome review covers five staged ordinary-height views on High and Lightweight, plus live West Track walks on both tiers. Each live walk uses W/Shift movement and changes only viewing direction through the review API. The boundary outlook is approximately 47 yards from the truck, facing SW 239 degrees. No birds were staged or time accelerated. All 18 captured views report zero browser or shader errors. These checks do not establish a completed hunt or phone frame-time performance.

Evidence is retained under `output/sharptail-connected-ground/`: `before-boundary/` is the preceding build, `production-final/` contains the final staged views, and `walk-high/` and `walk-lite/` contain normal traversal. Paused staged views have stale HUD labels; live walk captures show the real hunt state. The source manifest records build `e1a86cf42d170bf5`, served on port 4687.

**Cost and remaining work**

The added vegetation is chunked, instanced, opaque, and generated once. No per-frame placement or texture downloads were added. One small 256-square data texture supplies the shared ground masks. The existing shrub batch count remains unchanged.

At the matched boundary view, submitted geometry rises from 823,277 to 1,017,437 triangles on High and from 314,180 to 424,540 on Lightweight, approximately 24% and 35% respectively. Calls rise from 84 to 106 and from 60 to 82. The richer middle distance has a real rendering cost; actual phone frame-time measurements remain necessary before calling the mobile budget settled.

The connected western draw is more coherent, but final art approval and broader property composition remain open. Preserve the open prairie identity when refining other approaches instead of distributing the same shrub pattern everywhere.
