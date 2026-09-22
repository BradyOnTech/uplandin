# Quail and Sharptail regional atmosphere

Quail Fields now reads as warm Southern Plains country beyond its playable boundary: broken broadleaf drainage lines, open field gaps and a cream-toned horizon beneath uneven cloud banks. Sharptail Prairie uses cooler open-country light, much lower grass-covered swells and only two narrow distant windbreak groups. These changes complement the separately authored terrain and vegetation; they do not create hunting cover or collision from decorative scenery.

**Scope and cost**

The pass changes only `palette.ts` and `subsystems/sky.ts`. The same three rings render each property: 2,816 backdrop triangles for Quail and 2,688 for Sharptail, with no additional draw calls, textures, models or per-frame scene objects. Quail's two composite cloud groups evaluate 18 puffs per cloud-field sample, compared with the former five banks' 20. Regional silhouette sampling happens during initialization.

Quail's former large smooth ridge bands are replaced by low authored contours with separated broadleaf crowns. More than 90% of Sharptail horizon directions remain treeless; its nearest and farthest bands carry no trees. Neither region inherits mountain summits or a continuous conifer wall. Low contour valleys can sink below the local datum instead of being clamped into a constant-height strip. Sharptail's backdrop base blends toward scene fog, avoiding an extra bright horizon tint.

Quail's warm daylight key remains unchanged while the sky and distant-land colors become warmer. Sharptail's daylight uses a neutral warm sun with cooler sky/fill and clear distant air. Lastlight remains visibly dim; this is not a whole-image color filter. Chukar retains the original Quail-derived base preset through an explicit separate base, and all five Chukar/Cattail time-of-day objects compare exactly equal to their pre-edit values. Their horizon profiles, sampling and lighting branches remain unchanged.

**Evidence**

The pass started from `f96457b`. Existing final images in `artifacts/3d/prairie-blitz` were reviewed before editing. `output/regional-atmosphere/before.json` and `after.json` record six matched fixed-camera views each: Quail's windmill return and Sharptail's south grass shoulder at morning, noon and lastlight. They use the same 1440 × 810 viewport, FOV 70, seed, pose and frozen local source. The before/after source manifests differ only in the two owned modules. The early isolated rounded-cloud experiment was rejected after visual review; the retained version has flatter broken banks.

Both capture sets completed without page errors. Draw counts, triangle counts and renderer resource counts were identical in every matched pair: Quail's morning/noon view used 215 calls and 807,360 scene triangles; Sharptail used 146 calls and 645,113. These include the whole staged scene, not just the sky. They are not frame-time or mobile-performance measurements.

Focused `regionalAtmosphere` and `quailSkyBackdrop` checks cover sparse versus wooded silhouettes, wrapped seams, open low valleys, unchanged ring budgets, daylight/dusk separation, backdrop ordering and the existing Chukar shadow coverage. The comparison is staged environment evidence from a frozen Vite source preview, not a production build or played hunt. Parent integration still owns the final combined vegetation/terrain review, production build and ordinary moving-view acceptance. No physical-phone claim is made.
