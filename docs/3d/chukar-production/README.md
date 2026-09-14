# Chukar Ridge environment production proof

September 13, 2026. Playable environment and visual polish checkpoint, following the first route pass on September 12. Editable source assets and repeatable staged views support continued art review; this is not final art acceptance or a claim of finished mobile performance.

**Play and review**

With Vite running on port 4583:

- [Play the south entry](http://127.0.0.1:4583/index3d.html?area=chukar-ridge&drop=south-gate&quality=high&tod=morning&dog=generated&seed=7701&challenge=balanced).
- [Review seven locations](http://127.0.0.1:4583/tools3d/chukar-world-review.html). Switch light and detail, turn the view, or run the camera route study. This development page uses the actual renderer and heightfield, with the hunt paused. It is not a substitute for playing a hunt or testing movement collision.
- Press M in the game for the property atlas. The new benches, contours, rock footprints and connected paths use the same geography as the world.

**What changed**

The south entry now begins on a gentler shoulder, with an ascending route through Sage Bench and Split Shoulder to Rim Overlook. A return path joins the climb, and a separate traverse reaches Rimrock Tank. The western entry remains an alternate sidehill approach.

Ten authored rock brows establish the route's landmarks. The property has three broad climbing shelves, an eastern drainage and distant eroded tablelands. These are actual world landforms; they remain fixed when the drop, encounter seed or rendering tier changes.

Three basalt mesh families replace the former procedural ribs. Their feet conform to the local slope, preserving the upper face instead of sinking the entire asset to the lowest ground corner. A chain of collision circles follows each formation. Nearby talus, protected sage and bunchgrass stands take their placement cues from the same brows. New bench cover participates in stocking; rock footprints are removed from cover patches. Existing seed outcomes can therefore change.

Dry earth uses a generated painted texture, blended at two world scales and faded with distance. Warmer ground, a cooler shadow floor for basalt, Chukar-specific morning light and reduced decorative horizon walls support the new terrain. Other properties retain their existing environment treatments.

**September 13 polish pass**

The three rock families now have distinct, asymmetric profiles: a raised brow, broad overlapping shelves and a split shoulder with unequal masses. Tilted tops, weathered color planes and fallen wedges replace the repeated upright columns. The revised assets use fewer triangles and smaller downloads.

Bunchgrass uses finer bent blades, a low thatch skirt and smaller seed heads. Sage has spreading woody stems and fuller compound crowns. Continuous stand patterns now guide both plant placement and the underlying ground tint, with bare talus and sheltered growth responding to the rock layout. Detailed plant forms stay near the camera; simpler opaque geometry handles the distance and Lightweight tier without adding alpha overdraw.

Ground texture is quieter, cliff bedding is less uniform, and distant tablelands have less regular edges. Thin wind-shaped cloud banks and adjusted haze replace the generic cumulus treatment. Plant fill light varies with the time of day to preserve shaded detail without keeping the morning brightness at evening.

The path was partly buried because its height followed the analytic terrain rather than the rendered terrain triangles. It now fits the actual mesh in both detail levels and on either side of terrain tile boundaries. The review page also preserves the selected lighting after a reload and carries its light/detail choices into the play link. Playable landforms, route layout and stocking were not changed in this polish pass.

**Geology correction after screenshot review**

The screenshot review exposed two structural problems: rock pieces still used a repeated extruded-ring shape, and the distant terrain followed concentric terrace ramps. The kit now uses irregular fractured volumes with oblique faces, chipped corners and uneven crowns. Small outcrops and loose stone use the same shape language. The large formations sit deeper in their slopes to remove unsupported-looking undersides. Lightweight exports simplify the detailed rock surfaces rather than starting from a different primitive, preserving the main corners and silhouette.

Across the canyon, broad rubble fans support broken escarpments. Gullies cut into both the slopes and the skyline; uneven crests and projecting spurs replace the smooth terrace humps. Rectangular sampling distributes vertices evenly over the outside terrain, with lightly faceted normals and boundary skirts. Mineral patches and descending weathering streaks remain visible after close ground texture fades. The farthest silhouette bands have more relief and less flat clipping at their base.

The new **Rock face** staged view exposes the close formations and canyon together. **Rim Overlook** is the clearest comparison for the distant terrain. No new runtime texture downloads or scene draw passes were added. These changes affect scenery outside the parcel and rock presentation; mapped routes, bird stocking and playable terrain heights remain unchanged.

**Route composition and contact pass**

Following user acceptance of the revised geology, fourteen authored stands now shape the climb from Trailhead through Sage Bench and Split Shoulder to Rim Overlook. Grass groups soften the arrival and climbing shoulders; sheltered benches hold denser sage pockets; the brow openings and overlook apron remain exposed. Irregular, blended boundaries keep the stands from reading as stamped ovals. Plant placement and root-soil color share these same masks. They describe scenery rather than bird coordinates.

Five shallow dry washes descend from the rock slopes. They lower the playable heightfield by at most 38 centimetres, with continuous bends and tapered ends. Lighter sediment, loose gravel and reduced vegetation follow the same channels. Unlike the preceding geology correction, this pass makes small local changes to playable ground height; mapped paths and bird stocking remain unchanged.

Uneven rubble fans graduate from larger fragments near each formation to smaller chips downslope. Clearance is checked for individual fragments so one nearby path no longer removes a whole apron. Larger fragments retain habitat and access clearance. Sage crowns also reserve their full footprint beside paths.

Sage now has forked woody stems, unequal branches and smaller compound crowns. The detailed form uses 470 triangles; the distant/Lightweight form uses 110. Grass companions add local density inside selected stands instead of increasing the whole property's density. Grass and sage remain opaque and instanced. Existing rock exports and texture downloads are unchanged.

Plant roots now fit the actual rendered terrain triangles in both distance tiers. Shared vertex buffers retain per-instance height offsets, with matching wind and ground displacement in the shrub shadow pass. The directional shadow camera follows Chukar's elevation: the previous zero-height target left upper benches outside its coverage. Nearby Standard sage now casts shadows; Lightweight keeps the cheaper plant rendering. Less plant fill at evening and quieter close ground texture strengthen contact without increasing brightness everywhere.

**Editable asset workflow**

- Source gallery: [basalt-kit.blend](../../../assets/source/chukar-kit/basalt-kit.blend).
- Builder/exporter: [build.py](../../../tools3d/assets/chukar-kit/build.py).
- Studio shape review: [basalt-kit.png](basalt-kit.png). This is a Blender studio image, not an in-game screenshot.
- Runtime exports: [manifest.json](../../../public/models/chukar-kit/manifest.json).

To rebuild the kit from its deterministic geometry recipe:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/chukar-kit/build.py
```

To export after editing the saved Blender gallery:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/chukar-kit/build.py -- --export-only
```

The first command regenerates and overwrites the source gallery. The second preserves saved mesh edits. Keep the six asset object names and the `chukar_asset` custom property. Each export is one mesh with one vertex-painted material. Runtime dimensions come from the authored formation layout; source units are metres. The game supplies lighting and material response.

Each Standard mesh is 564–632 triangles and about 65–73 KB; each Lightweight mesh is 338–378 triangles and about 40–44 KB. The game loads three meshes for the selected tier: about 205 KB total for Standard or 124 KB for Lightweight. The source Blender file and source PNGs are not runtime downloads. All runtime kit exports and the ground WebP are included in the offline asset manifest.

**Generated art**

Built-in image generation produced both images, without image references. Exact prompts are saved in [image-prompts.txt](image-prompts.txt).

- [Environment concept](concept.png): the art direction target for the route, geology, palette and vegetation relationships. It is not a capture of the current game.
- [Ground source](../../../assets/source/chukar-kit/dry-ground-source.png): the original generated raster.
- [Runtime ground texture](../../../public/textures/terrain/chukar-dry-ground.webp): resized to 1024 square and encoded as WebP, quality 83. Its color variation is blended with the terrain material rather than displayed at full strength.

**Verification**

The full regression run passed 776 tests across 102 files after the composition, rubble and climbing-shadow changes. After the final plant-ground correction, 31 focused tests passed across four files, including two new environment-builder checks. Those raycast sampled plant roots against both actual terrain grids and verify that visible and shadow materials share the player's terrain tier and wind frame. Other focused coverage includes route and habitat constraints, exported GLB budgets, grounded paths, plant detail tiers, continuous distant relief, the horizon budget, drainage continuity and evening shadow coverage at the upper benches. The existing shared Quail grounding helpers were reused without modifying their behavior.

The final `npm run build` passed TypeScript and the production build. The existing large JavaScript chunk warning remains.

Browser review inspected Trailhead, Rock face, Sage Bench, Split Shoulder and Rim Overlook, plus the opening portion of the moving route study. Standard and Lightweight were compared at Sage Bench; upper-route contact and broad rock shadows were reviewed in evening light. This pass did not include a complete camera route, played hunt or physical mobile performance testing.

At the same morning Sage Bench camera in the 1280 by 720 browser review, after the final plant-ground correction:

| Tier | Submitted draws | Submitted triangles |
| --- | ---: | ---: |
| Standard | 172 | 1,871,474 |
| Lightweight | 149 | 562,630 |

These are renderer submission counters, including repeated rendering passes, not measured frame rate. Lightweight reduces this view's triangle submissions by about 70 percent. Standard's richer crowns, local companion grass and nearby plant shadows increase geometry submissions relative to the preceding geology-only checkpoint. Root alignment also adds a small per-instance attribute and vertex-shader work. These improvements do not establish a mobile frame-time budget.

**Integration with the goshawk PR**

On September 13, the Chukar code checkpoint `0f285b5` was combined with [PR #1, Add fist-launched goshawk Quick Hunt at Cattail Coverts](https://github.com/BradyOnTech/uplandin/pull/1), at `35d7a37836fe075dbe612189e1ec74b6ef0d8a18`. Both branch tips were compared against freshly fetched `main` at `070ec81d82d91db23d015cff2de7963eb7435937`.

The branches have no changed-file overlap. Merging in either order produced the same Git tree, `9549951371a6cea7f409f312b42587cda0cdc807`. A separate detached checkout of that combined tree passed all 795 tests across 106 files and the production build. No conflict resolution or behavior changes were required. The additional checkpoint documentation does not change that tested code.

Browser checks on the combined development build covered Chukar entry, survey-map opening and whole-property zoom, closing the map, dog cast-off, keyboard aiming and firing, reload initiation and pause-menu equipment. The Cattail falconry practice entry retained its hawk, method-specific controls and a naturally established dog point; the new Cattail atlas opened correctly and covered the field controls. The Chukar check reported no browser console errors. These are bounded integration checks, not a new complete hunt or catch/recovery acceptance run.

Merge the existing goshawk PR first, then the Chukar/atlas PR, keeping each feature independently reviewable. Either order is technically compatible at the recorded tips; new code on either branch or `main` requires reassessment. This verification did not merge either PR into remote `main`.

**What still needs refinement**

The user accepted the revised rock and distant terrain direction. This route pass needs the same visual judgment, especially the close sage silhouette, simpler distant/Lightweight crowns and the balance between exposed ground and planted pockets. Composition is most deliberate along the south climbing route; the western approach and return branches have not received equivalent authored stands. The concept remains ahead of the in-game art, and this is not final environment acceptance.

A complete hunt still needs assessment for encounter pacing, high-side approach choices, dog navigation around the new rocks and return-to-truck flow. Route geometry tests and staged camera views do not establish those experiences. Physical mobile testing, sustained frame times, loading behavior on slower connections and long-session memory remain separate acceptance work.

Keep this route as the benchmark: concept and reference, shared terrain and habitat, editable mesh kit, actual game composition, then performance and hunting review. Expand to the next property only once this benchmark earns approval.
