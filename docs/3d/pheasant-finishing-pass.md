# Pheasant finishing pass and sporting gun rack

This pass strengthens the existing Pheasant Coverts environment, measures and reduces its terrain-loading cost, reviews alternative field approaches, and gives all four shotguns distinct models in both the gun rack and the hunting view. The user's subsequent feedback adds seated foregrips and aimed firing without an airborne-bird requirement. It does not establish the broader AAA benchmark or real-phone readiness.

**Environment**

Shelterbelts now have neighboring groups of bronze, buff and olive foliage, varied mature height and unequal crown lobes. Standing cover has stronger shared stand colors. Sunlit stubble, dark standing-cover litter, cool wet banks and maintained farmyard ground separate more clearly; the repeating ground texture has less influence. Lighting gives the sunny and shaded sides more separation.

Core cover density and height remain intact. All 145 tree obstacle positions/radii match the original. The six matched views have exactly the same draw calls and triangle counts, covering both entries, High/Lightweight and morning/noon/evening. Scenery alone remains 19 meshes and 101,316 triangles. These comparisons precede the shotgun additions, which add a small action-specific viewmodel cost.

The matched `homestead-front` capture is actually at the wet margin and must not be used as evidence for dry yard materials. A separate final `homestead-dry-yard` view checks the maintained approach. Evidence: `output/playwright/pheasant-finish-world-before.json`, `pheasant-finish-world-after.json`, `pheasant-finish-{before,after}-*.png`, `pheasant-finish-yard-homestead-dry-yard.png`, and `pheasant-composition-vegetation-contract.json`.

**Loading and rendering**

The performance profile identified repeated Pheasant pond calculations during terrain and vegetation construction. The shared sampler now finds the nearest normalized pond once. Because wetness and dry-ground influence are monotonic in that radius, the result is unchanged while avoiding redundant work. The comparison retained the original executable sampler: 18,304 surface samples, with seven fields each, matched exactly across both entries and overlapping pond envelopes. Chrome's alternating sampler benchmark improved 28.6%; this is the computational improvement, not a GPU speedup.

| Isolated development load | API ready before → after | Longest construction task before → after |
| --- | --- | --- |
| Desktop High | 2.609 → 2.302 seconds | 2.080 → 1.802 seconds |
| Desktop Lightweight | 1.948 → 2.154 seconds | 1.697 → 1.512 seconds |
| Phone-sized Lightweight, 4× CPU emulation | 7.364 → 6.501 seconds | 6.893 → 6.005 seconds |

These are single paired development loads, including the concurrent art changes. Lightweight's total startup worsened in this pair despite faster terrain computation; do not claim uniformly improved startup. Dense-cover capture rendering held about 120 FPS on the M1 Pro with identical scene counts. Capture mode freezes the simulation. A separate normally entered High baseline ran simulation and rendering for 20 seconds; an interrupted Lightweight live run was excluded. No physical-phone, thermal or lower-end-device conclusion follows from these measurements. Evidence, source hashes and profiles are in `output/audit/performance-20260912/summary.json` and its neighboring files.

**Route and encounter review**

Four capped routes used normal entry and keyboard/mouse movement on a frozen production build. Route steering used public survey waypoints, dog position and point state; approaches are explicitly assisted. There were no forced rises, hidden-bird-position steering, teleports, forced hits or shots. The final runs used isolated headless Chrome to avoid focus interruption; the initial interrupted headed attempt is preserved separately and excluded.

| Approach | Duration / distance | Route coverage | Observations |
| --- | --- | --- | --- |
| West inner | 161 seconds / 303 metres | Complete | Three point episodes; four airborne birds sampled at 20–4.5 metres |
| West harvested flank | 180 seconds / 375 metres | Complete | Recalled across the open field, cast at the fence end; one steady point |
| South shoreline / inner Homestead | 194 seconds / 382 metres | Complete | One worked point and three rises; onward travel left the dog holding earlier Slough scent |
| South headland / neck / far Homestead | 300 seconds / 644 metres | Final leg, 7.75 metres short of last waypoint | Recalled across headland, cast at neck; two points and one sampled rise at 11.9 metres |

The mapped routes are traversable and create different handling consequences. Continuing onward without answering a sustained holding-scent cue leaves the dog behind; recalling and recasting brings it to the next line. All airborne birds escaped because no shots were taken. No runtime errors or blocked mapped paths were found. No defect justified changing bird density, runner behavior or point timers.

Airborne ranges are the first sampled telemetry, not human identification distance. These four observations do not establish statistical superiority, unaided navigation, aiming, audio acceptance or complete-hunt readiness. Evidence: `output/playwright/pheasant-finish-route-summary.json` links the full logs, videos and screenshots.

**Shotguns and firing**

The same model factory serves the rack and the field. The pump has a short ribbed sliding forend, while the semiautomatic now represents a Browning A5 with a longer forend and the high, flat rear humpback receiver. Its profile follows [Browning's A5 reference](https://www.browning.com/products/firearms/shotguns/a5/overview.html); gameplay remains the existing semi-auto action. The over/under has stacked barrels and a deeper action; the side-by-side has horizontally paired barrels, a wider boxlock and straight stock. Doubles hinge the barrels and forend together, eject and replace the missing one or two shells, then close within the existing gameplay reload duration. All four retain the same mounted bead position. The forend shoulders now seat against the supporting metal instead of leaving visible bedding gaps; the pump retains clearance throughout its travel. The loading sleeve joins the wrist and extends behind the camera instead of exposing a floating cap. The old doubles-only mesh and its unused material/aim code have been removed.

Aimed firing in 3D now works without active flying birds. Keyboard, mouse and touch share the same firing rules: mounting, pause, reload, ammunition and action cooldown still apply. A pending trigger belongs only to the short mount window; bird activity does not decide whether it fires. A new flush no longer clears the action cooldown. The 2D shooting scene is unchanged.

| Gun | Capacity | Career unlock | Action delay |
| --- | --- | --- | --- |
| Remington 870 pump | 3 shells | Level 1 | 500 milliseconds |
| Browning A5 | 3 shells | Level 3 | 250 milliseconds |
| Over/under | 2 shells | Level 5 | No added delay |
| Handmade side-by-side | 2 shells | Level 8 | No added delay |

All four are available in Quick Hunt. A standalone `index3d.html?gun=...` preview uses the requested valid gun; an invalid value falls back to the pump. Career and Quick Hunt retain their saved selections even if a `gun` parameter is present. The rack's field links do not edit the saved equipment. The pause/entry Shotgun selector changes the equipped model in place, preserves the live hunt and remembers the shells in each stowed gun. It cancels an interrupted reload without refilling that gun. Explicit choices persist to the Quick setup or unlocked career loadout; standalone selection updates the current URL.

**Rack interface**

| Before | After |
| --- | --- |
| No inspectable gun rack | `shotguns3d.html` uses the real field models with drag/zoom and Side, Above, Breech, Barrels and Reset angles |
| No action inspection | Cycle preview for pump/semi-auto; reload playback and a scrubber for all four |
| No direct field preview per gun | A separate Pheasant hunt link carries the selected gun ID; the paused field menu links to the rack in a new tab |
| Hard-to-reach equipment from pause | A dedicated Shotgun selector, current capacity and large 3D Gun Rack button sit above display settings; the rack opens on the equipped model |
| Repeated entry instructions in pause | The return card hides introductory instructions; keyboard focus skips hidden and disabled controls |
| No phone rack layout | Responsive order keeps selection and the 3D model together; controls use at least 44-pixel hit areas, visible keyboard focus and restrained press feedback |
| No idle-render policy | The viewer draws on changes or while an action plays, caps pixel ratio at 1.5, and pauses animation while hidden |
| Interrupted action could stay half-cycled | Manual reload inspection settles the pump/bolt before applying the selected phase |

The viewer uses the game's cream, gold and dark green palette, readable numeric labels, specific transitions and reduced-motion styling. It is included in the production build and offline asset manifest. Mouse/touch layout review is not physical-phone performance evidence.

**Dog roster**

Gameplay supports German Shorthaired Pointer, English Pointer, English Setter, German Wirehaired Pointer, Vizsla, Pudelpointer, American Brittany, French Brittany, Deutsch-Drahthaar, Wirehaired Pointing Griffon and Irish Setter. Their gameplay profiles differ. This does not mean there are 11 distinct 3D dog models: current 3D appearance supports GSP and English Setter; the other breeds use the Setter fallback. The generated model/motion path is the liver-white GSP.

GSP coats are liver-roan, liver-white, solid-liver and black-roan. Setter coats are orange-belton, blue-belton, tricolor, liver-belton and lemon-belton. Those model limitations remain separate future work.

**Verification and remaining limits**

The combined suite passes 733 tests across 98 files; TypeScript and the production build pass. The existing large-bundle warning remains. A draft test under the untracked review output was mistakenly collected on the first suite run; it was renamed as a text artifact, and the normal suite then passed.

Focused coverage includes physical foregrip contact, pump clearance, barrel axes, one/two-shell reloads, sleeve attachment, camera sight alignment, disposal, free firing across all four actions and input paths, cooldown across changing rises, and paused equipment swaps without hunt resets or refilled stowed guns. Menu checks preserve fresh career/Quick state and enforce career unlocks.

Ordinary browser input review confirmed no-bird F/Space, held-right/left mouse and emulated touch Aim/Fire each consume one shell; keyboard and touch reload return it. No phantom hits, waiting-for-flush hint or page errors occurred. The ordinary menu review changed all four guns while paused, preserved exact hunt/camera/seed, restored the pump's two remaining shells when switching back, resumed/reloaded, and opened the selected rack model. A fresh 393×852 emulated phone pause view shows both equipment controls at 46 pixels high and fully visible.

Evidence: `output/audit/free-fire-20260912/result.json`, `output/audit/shotgun-menu-20260912/result.json`, `output/audit/shotgun-menu-20260912/phone-paused-final.png`, `output/playwright/shotgun-rack-review.json` and `output/playwright/shotgun-attachment-review.json`. The attachment images supersede the original rack profiles for foregrip, A5 and sleeve presentation. Earlier screenshots remain historical comparisons, not current acceptance images.

The environment pass is bounded and complete as implementation/review work. The broader experience still needs cohesive sound, meaningful conditions, ordinary aiming and dog-readability acceptance, and real lower-end/phone performance evidence. Further isolated material or gun detail is not the default next priority.
