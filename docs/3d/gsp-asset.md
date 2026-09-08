# Quail Fields German Shorthaired Pointer

The liver-and-white GSP is a source-conforming, skinned game asset with a new anatomical surface. It preserves the supplied dog's facial, chest and haunch shapes, coat and natural tail while reducing the runtime geometry to 11,100 triangles. The supplied `GSP-liver-white.glb` remains unchanged. The hero is an authored surface fitted to that reference rather than an automatic reduction of its roughly 1.5 million triangles.

**Editable source and repeatable build**

`assets/source/gsp/gsp-liver-white.blend` contains the refined skinned mesh, a hidden `GSP_ControlCage` with the original anatomical loops, the skeleton, all animation actions, packed textures, and a studio collection for diagnostic renders. `Original source reference (preserved GLB)` records the source file and its SHA-256 digest without embedding the 1.5-million-triangle original in the working blend.

`tools3d/assets/gsp/build_gsp.py` rebuilds the model, bakes its coat, authors clips, saves the editable blend, and exports all three levels of detail. The build was developed against Blender 5.2.1 LTS. Run from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools3d/assets/gsp/build_gsp.py -- --render --animation-frames
python3 tools3d/assets/gsp/validate_asset.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools3d/assets/gsp/validate_deformation.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools3d/assets/gsp/validate_gait.py
```

The first command writes only the GSP source, runtime assets, and diagnostic renders. The optional `/tools3d/assets/gsp/viewer.html` route on the development server inspects clips, detail levels, the skeleton, and mouth/contact markers with Three.js. Omit `--render --animation-frames` for a faster export. `--no-export` is available for studio-only checks. Rebuilding intentionally regenerates the canonical blend; it is not the export path for artist edits.

The separate `gsp-liver-white-rigify.blend` adds editable canine controls while preserving the direct animation actions. Follow [the Rigify authoring workflow](gsp-rigify-workflow.md) to animate controls or edit the existing actions and export a staged package without regenerating the mesh or overwriting the artist's source. The game clips described below remain scripted, baked joint animation; adding controls does not make them hand animated.

**Surface and material design**

The torso, neck, skull, muzzle and four limbs share a connected surface. Deliberate cross-section loops are fitted to the original dog's surface with bounded ray and nearest-surface queries. Shoulder and hip openings lead into joint loops at the elbows, wrists, knees, hocks and compact paws. One subdivision step and a restrained surface projection restore cheek, shoulder, rib and haunch planes. The hero is exported as fixed geometry.

The revised skull is slightly arched, with a stronger, longer muzzle and restrained stop. Dark brown almond eyes lie close to the skull; closed ear leather follows the cheeks. The lower jaw is split from the actual muzzle surface, with a mouth interior and a sealed resting lip line. The tail shares a connected opening with the rump. These decisions follow the proportions described in the [AKC GSP standard](https://images.akc.org/pdf/breeds/standards/GermanShorthairedPointer.pdf), while retaining the source's natural tail.

Skin weights combine a volumetric torso/limb field with explicit feathered face, jaw, ear, tail and sole anchors. This hybrid weighting resolved the earlier elbow tear and haunch fold. Every source vertex is limited to four normalized influences before saving or rendering; derived LODs are limited and normalized again after reduction. The Blender preview therefore uses the same influence limit as the browser. This is not a claim of a wholly hand-painted skin.

The hero uses a 1024 × 1024 albedo atlas and a 16 × 4 face palette. Two materials become two draw groups. Coat color is baked from the original source, with source-triangle color projection filling mirrored or occluded areas and restrained filtering to soften boundaries. There is no fur shader, runtime subdivision or high-frequency normal map. The distant variants simplify the authored hero and retain the same rig and animation contract.

| Level | Triangles | Source vertices | Intended use |
|---|---:|---:|---|
| LOD0 | 11,100 | 5,620 | Close dog and inspection |
| LOD1 | 4,662 | 2,394 | Normal working distance |
| LOD2 | 1,997 | 1,042 | Distant dog |

Exported vertex counts are higher because UV islands and material boundaries split vertices. Current byte sizes, triangle counts, hashes, and validation evidence are recorded in `public/models/gsp/manifest.json` and `public/models/gsp/validation.json`. Distance thresholds require gameplay evaluation; these labels do not establish that a particular threshold is invisible.

**Coordinates and skeleton**

The asset is authored in metres, with Blender -Y forward and Z up. Anatomical left is positive Blender X. Standard GLTF export converts it to Three.js +Z forward and Y up. The rig object is `GSP_Rig`; the closest mesh is `GSP_LiverWhite_LOD0`. The shoulder is approximately 0.635 m high, with the nose approximately 0.62 m forward of the root and stationary hind contacts approximately 0.54 m behind it. Paw contact markers are placed close to the sole; runtime grounding accounts for the evaluated mesh and terrain rather than assuming the root is a perfect contact plane.

There are 39 named bones. Central bones are `Root`, `Pelvis`, `Spine`, `Chest`, `Neck`, `Head`, `Jaw`, and `Tail01`, `Tail02`, `Tail03`. Each side (`.L`, `.R`) has `Shoulder`, `UpperArm`, `Forearm`, `Carpus`, `FrontPaw`, `Hip`, `Thigh`, `Shin`, `Hock`, `HindPaw`, `EarBase`, and `EarTip`. Attachment bones are `MouthSocket`, `FrontContact.L`, `FrontContact.R`, `HindContact.L`, and `HindContact.R`.

`Root` remains in place with no authored translation or heading change. The simulation owns movement and heading. `MouthSocket` is parented to `Jaw`; attach the carried bobwhite there and tune its local offset against gameplay. Contact bones are exported even though they do not deform vertices. Three.js sanitizes dots out of imported node names: Blender `FrontPaw.L` becomes runtime `FrontPawL`, and `FrontContact.L` becomes `FrontContactL`. Central names such as `Head` and `MouthSocket` remain unchanged.

**Animation contract**

All actions are sampled at 30 fps. The manifest lists exact durations, nominal ground speeds, loop behavior, and contact fractions. Clip names are stable:

- Locomotion: `walk`, `trot`, `lope`, `turn_left`, `turn_right`, `carry`, `heel`.
- Quiet behavior: `idle`, `attentive`, `scent_check`, `locate`, `stalk`, `point`.
- Transitions and interactions: `start`, `stop`, `lock`, `pickup`, `deliver`.

Walking uses a lateral footfall sequence: left hind, left front, right hind, right front. Trot synchronizes left front with right hind and right front with left hind. These distinctions are supported by [observed canine locomotion](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936). The earlier candidate had the walking hind phases reversed; the correction changes all seven walking-family actions and their metadata together. Trot was already diagonal and remains unchanged. Lope uses staggered fore/hind footfalls and a shorter contact interval.

Stance travel is derived from nominal speed, clip duration and contact fraction. Shoulder articulation extends the forelegs' working reach. The hind solver retains a forward knee and backward hock. A point lifts and folds the left forepaw; `lock` brings the dog gradually into that stance. Their left-front contact has `stanceFraction: 0`, with `mode: lifted` for point and `mode: lifting` for lock. Stationary support markers use `mode: planted`; moving contacts use `mode: gait` with phase and stance fraction. Start and stop anticipation retain planted feet.

The mixer should set the authored pose first. Optional terrain corrections run afterward and must start from that frame's fresh mixer pose. Do not keep both the previous procedural dog's limb transforms and the GLB mixer in control of these bones. Head gaze should be a bounded adjustment to `Head`; scent, spine, shoulder, ear, and tail motion are already present in the authored clips. Scale clip playback by actual ground speed relative to the manifest speed and crossfade between suitable gaits.

Looped `turn_left` and `turn_right` bend the upper body toward a turn; they do not rotate the root. `start`, `stop`, `lock`, `pickup`, and `deliver` are one-shot actions. They require runtime transitions and semantic triggers; merely exporting them does not establish that game state uses them correctly.

The 1.6-second pickup ends at the low grip pose. It must be fitted to the existing 0.7-second simulation hold, then transition upward into carry after the authoritative bird attachment. Moving hind contacts are closer under the body than the stationary stack; a runtime settling step must bridge into lock/point rather than dragging a supporting paw through that change.

**Evidence and remaining checks**

`docs/3d/gsp-renders/index.html` arranges the studio views and six-frame samples for each inspected animation. `docs/3d/gsp-renders/` contains the full-resolution images. These are explicitly diagnostic asset previews. They are not normal-gameplay screenshots, performance evidence, or proof that the dog successfully finds, points, and retrieves birds in the game.

`validate_asset.py` reads the shipped GLBs and checks all clip names and durations, bone coverage, two materials and images, finite values, normalized weights, valid joint indices, triangle counts, in-place root motion, and preservation of the supplied source. It writes an asset-contract report only after the assertions pass.

`validate_deformation.py` samples the saved Blender clips, reporting mesh bounds and flat-ground contact drift at nominal gait speeds. The report exposes errors without silently labeling them acceptable. It does not prove slope contact, absence of intersections in all blended transitions, visual appeal, browser rendering performance, or runtime state coverage.

The final asset-contract run passed for all three exported GLBs. The flat-ground report found no measurable forward stance drift to five decimal places in walk, trot, lope, carry, heel, start, stop or the three supporting paws in point. Supporting contacts in those gaits remain 0.009 m above the nominal floor. Pickup ends with `MouthSocket` at 0.10677 m; its supporting feet remain stationary and its minimum mesh height is 0.00278 m. The validator rejects any clip whose mesh passes more than 0.003 m below the floor. These measurements describe authored clips and exclude runtime slope correction.

`validate_gait.py` independently selects 113 physical sole vertices per paw by their resting position, then samples the deformed skin and contact markers. All seven walking-family actions now follow the lateral sequence. In trot, physical diagonal paw travel correlates above 0.99999 and same-side front/hind travel is opposed. The saved `assets/source/gsp/gait-report.json` records the final source hash and full trajectories. This check catches a phase error or side-mapping mistake even if the contact metadata looks plausible.

The before-revision studio views remain in `docs/3d/gsp-renders-before-anatomy-revision/`. The updated review includes a clay trot and exact pickup endpoint so coat color cannot hide the joint surfaces. The formerly pronounced near-elbow tear and near-haunch fold are resolved in that reviewed pose. Broad pectoral webbing and an angular fold at the far upper hind limb remain visible at full extension; assess them in continuous field motion. Scripted locomotion and interaction clips still need an animator's performance refinement even when their contact mathematics pass.

Acceptance still requires ordinary gameplay footage, transitions across the full hunting loop, varied viewing directions and terrain, close inspection of shoulders/hips/mouth, foot contact in the browser, and performance measurements on the target devices. This candidate should not be described as production approved solely because the structural checks pass.

**Sources**

- [AKC German Shorthaired Pointer standard](https://images.akc.org/pdf/breeds/standards/GermanShorthairedPointer.pdf)
- [Canine terrestrial and aquatic locomotion study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936)
