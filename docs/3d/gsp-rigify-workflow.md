# GSP Rigify authoring workflow

The current game skeleton and its 18 scripted animation clips coexist with a separate Rigify control rig in `assets/source/gsp/gsp-liver-white-rigify.blend`. This is an authoring improvement, not evidence that the existing clips were hand animated or converted into controller animation.

**Source and runtime separation**

Blender 5.2 bundles Rigify's basic quadruped and wolf metarigs. The prototype uses the basic quadruped because its front-paw and rear-paw solvers fit the existing joint chains without importing an unused wolf facial rig. The fitter reads the named rest positions from the source skeleton and adds jaw and two-segment ear controls.

Generation creates 257 Rigify bones, including 91 custom control shapes, 210 constraints and 106 drivers. Another 39 hidden output bones carry the exact game rest bases, producing a 296-bone authoring rig. The original 39-bone game skeleton, hierarchy, vertex groups, mouth socket and foot-contact markers remain separate. Runtime exports contain the 39 game joints and baked actions; Rigify controllers, mechanisms, output bridges and constraints do not ship.

The output bridges disable inherited deformation scale and the paw solvers disable IK stretching. This preserves rigid game-bone transforms that can be baked into glTF without introducing shear. It does not solve poor poses, unreachable foot targets, skin weights or animation timing automatically.

**Create an editable copy**

Run the Blender executable with `tools3d/assets/gsp/rigify_authoring.py -- --source INPUT.blend --output EDITABLE.blend`. The input and output must be different files. The tool fits and generates the controls, verifies full neutral bone matrices, preserves the existing direct actions and saves only the new output file.

Select `GSP_Rigify_Controls` and use its `authoring` custom property:

- Off is legacy playback. Select `GSP_Rig` and play or edit the existing direct game-bone actions.
- On is controller authoring. Animate the Rigify controls and save actions named `CTRL_<clip>`, such as `CTRL_point`. The game skeleton follows those controls through the output bridge.

Useful controls include `front_foot_ik.L/R`, `foot_ik.L/R`, `torso`, `hips`, `chest`, `neck`, `head`, `jaw` and the ear controls. Rigify also exposes FK chains and limb IK/FK properties. The prototype does not retarget all existing clips onto these controls. Adding controls must never be presented as a replacement for an animator's gait and performance work.

Rigify's generated UI script is stored in the authoring file. If Blender opens the file with its embedded scripts disabled, control shapes and ordinary bone properties still exist, but generated snapping/operator panels may require running that locally generated Rigify UI script. The tools do not change global script-security preferences.

**Export artist edits without regeneration**

Run Blender with `tools3d/assets/gsp/export_rigify.py -- --source EDITABLE.blend --output DOG.glb`. This exporter loads the edited file, copies the hero mesh and 39-bone skeleton into temporary export objects, and bakes evaluated transforms at 30 fps. It never invokes the procedural mesh or pose builder and never saves over the input `.blend`.

For each of the 18 names in the animation manifest, a matching `CTRL_<clip>` action is an explicit replacement. Otherwise the exporter uses the existing direct action. It verifies sampled evaluated skin vertices against the source before export, then removes non-export objects and unrelated actions only within that disposable Blender process. The resulting GLB must contain exactly the requested action names, 39 joints and no Rigify nodes. A neighboring `.export.json` records each clip's origin, its source action, timing, geometry comparison and source-file hash. Diagnostic `--clips point` exports only that known subset.

Controller action duration must agree with the animation manifest. Contact phases, nominal speed, looping and semantic state still need deliberate review when replacing a clip; equal duration alone does not establish correct contact metadata. NLA tracks are muted deliberately: this path exports named actions, not strip timing or NLA time warps. Export ignores the scene playback bounds and shifts each action to time zero, so an artist may place an action elsewhere on the timeline without clipping it or adding a long runtime delay.

Use `--package-dir STAGING_DIRECTORY` instead of `--output DOG.glb` to produce a complete candidate package. The exporter derives LOD1 and LOD2 from the edited hero at the same 42% and 18% reduction ratios used by the original pipeline. It exports all 18 actions and 39 joints into every LOD, copies the supplied manifest, updates triangle/vertex counts, byte sizes and SHA-256 hashes, and records action origins in `rigify-export.json`. Run `python3 tools3d/assets/gsp/validate_asset.py --directory STAGING_DIRECTORY` before promoting those files. Package mode rejects clip subsets. Silhouettes, weight reduction, animation contacts and browser performance still need review; package creation is not visual approval or compression optimization.

The hero must already use at most four bone influences per vertex. If an edit exceeds that, the exporter stops with a request to limit/normalize the weights and review the source deformation. This prevents the browser export from silently changing a skin that looked different in Blender. LOD simplification can merge vertex groups, so each derived LOD is explicitly limited and normalized again before export.

The supplied manifest remains authoritative for coordinates and animation semantics. Pass `--manifest UPDATED_MANIFEST` if those deliberately change with a new mesh or performance. Running `build_gsp.py` regenerates the procedural source and is not an export path for artist-keyed edits.

**Observed prototype evidence**

The scratch work is under `/tmp/uplandin-rigify-feasibility`. The first output bridge was rejected after its render showed disjoint geometry: creating a zero-length edit bone and assigning its matrix had retained an incorrect default orientation. Correct head positions hid rotation errors. The corrected code sets valid head/tail endpoints before assigning the complete rest matrix.

After correction, 4,930 evaluated neutral vertices matched the unposed source within 1.32 micrometres. A controller-only left-front-paw lift moved its contact by 11.999 cm while the other three contacts remained stationary. The first diagnostic also exercised the jaw, head and ears; its open jaw is a control test, not a proposed pointing performance.

Across all 31 frames of that diagnostic, the baked skin matched controller evaluation within 0.39 micrometres and complete joint matrices within 6.41e-7 per component. The exported GLB contained 39 joints and one named diagnostic clip with no Rigify nodes. Reimporting at the same 30 fps matched neutral, raised-paw and return skin positions within 0.48 micrometres. The reports are `prototype-report.json` and `glb-roundtrip.json`; the images are `neutral.png` and `controller-point.png`.

The fitter also ran on the source-conforming anatomy candidate in `/tmp/uplandin-gsp-anatomy-candidate/gsp-liver-white.blend`. With authoring disabled, six representative legacy clips at their first, middle and last frames matched the source within 0.24 micrometres. The nondestructive exporter preserved all 18 legacy clips and 39 joints, with maximum sampled bake skin error below 0.6 micrometres. These checks establish preservation of those source motions, not their artistic quality. Full controller-driven locomotion, revised anatomy acceptance, final LOD exports and ordinary browser motion still require review before canonical integration.

A further source-edit test added a three-key `CTRL_point` action to the revised anatomy scratch file, then exported it alongside the other 17 legacy actions. The resulting `controller-replacement-export.glb` contained exactly the expected 18 names and 39 joints, with the point bake matching evaluated controller skin within 0.27 micrometres. The output report identifies that one controller-authored replacement separately. A diagnostic repeat also checked that the input `.blend` hash remained unchanged. `new-anatomy-controller-point.png` shows the actual revised mesh responding to the raised-paw control; its three-key test is not a final approved performance. The scratch source was opened in Blender Pose Mode and its colored control shapes inspected with embedded-script execution left disabled.

The package export was also exercised on that earlier anatomy snapshot, then on a scratch copy whose `CTRL_point` keys were shifted from frames 0–96 to 200–296 while the scene playback range remained 0–96. Both complete packages passed the runtime asset validator at all three LODs. The shifted controller action still exported with its intended 3.2-second duration, and the source hashes remained unchanged. This regression evidence is under `/tmp/uplandin-rigify-package-review` and `/tmp/uplandin-rigify-shifted-package`; neither package was promoted into the game. It tests the exporter, not the pending anatomy correction.

**Canonical editable source**

The clean Rigify file was generated from the final corrected legacy source with SHA-256 `b294d297eea5d2ee35a85f6115da8fc4fc12b756c5c2958b48457fde76e75a57`. It retains 39 game bones, 296 authoring bones and 91 control shapes. Controller authoring is off by default; no diagnostic `CTRL_` replacement action was added. The original source hash remained unchanged.

A complete staging export from this clean file passed the runtime asset validator at all three LODs: 11,100 / 4,662 / 1,997 triangles, exactly 39 skin joints and 18 expected clips in each, two materials and normalized runtime weights. The export report identifies all 18 actions as legacy direct game-bone actions. Sampled hero skin baking differed from the evaluated source by at most 0.55 micrometres, and the editable input file hash remained unchanged. The staging package is separate from the canonical runtime assets; it validates the nondestructive authoring export path and does not replace visual or runtime gait review.
