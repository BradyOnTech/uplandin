# English Setter reconstruction outcome

## Outcome

The `img2threejs` experiment produced a useful breed-specific refinement of Uplandin's live procedural dog. The integrated result is a deliberately sparse, animated English Setter game actor rather than a photogrammetric or show-coat replica.

The final manual visual score is **0.75**: the dog reads correctly and the local detail remains approximate. The review action is `stop`, because the remaining silhouette difference is dominated by dense coat and feather volume that would require a separate higher-detail/manual-art route.

## What the repository contributed

The repository was valuable for:

- reference admission, conflict handling, and evidence traceability;
- a component/detail inventory and strict sculpt specification;
- fixed-view, multi-angle, and self-correction review discipline;
- explicit action-readiness and assembly checks.

Its generic TypeScript generator was not suitable as the shipping quadruped solution. The generated diagnostic blockout was a 6,336-triangle, 22-draw-call ellipsoid mannequin with a 0.43 visual score. It proved the tool path, but the live hand-authored canine loft was both more recognizable and much cheaper.

## Integrated breed changes

- longer squared setter head and muzzle with a larger skull mass;
- low, flared drop ears and small warm eye accents;
- deeper heart girth/brisket, narrower lifted abdomen, and level topline;
- broader hip mass, visible hock angulation, and sparse rear furnishings;
- articulated base-and-mid flag tail with shallow two-sided feather locks;
- palette-only warm-white/charcoal blue-belton treatment;
- named runtime pivots, sockets, collider intent, and integral-component metadata;
- capture-only isolated and neutral conformation views for repeatable review.

The user-supplied working three-quarter image was used as internal structural/pose evidence only. It is not treated as a redistributable project asset.

## Gate summary

| Gate | Result | Evidence |
|---|---:|---|
| Strict sculpt-spec validation | Pass | `strict-validation.json` |
| TypeScript/Vite build | Pass | `npm run build:3d` |
| Test suite | Pass | 21 files / 220 tests |
| Live dog budget | Pass | 386 triangles / 15 draw calls |
| Locked pointing paw contact | Pass | load-bearing gaps 0, 0.0217, 0.0219 m |
| Eight-angle coat lighting | Pass | 8/8, 0% clipped coat pixels |
| Multi-angle volume | Pass | front 0.550, rear 0.526, three-quarter 0.917 of side area |
| Manual visual review | Stop at 0.75 | target game approximation reached |
| Tier-1 photo silhouette | Fail | IoU 0.304; show-coat/profile gap retained |
| Fully separable part coverage | Fail | 8 errors / 12 warnings; fused game-LOD regions documented |
| Animation/action hierarchy | Conditional pass | all independently moving segments are named and pivoted |

The Tier-1 result is not overridden. The repository documents that photo-versus-procedural pixel gates are strongly affected by framing, background, pose, and coat treatment; in this case the failure also correctly identifies the remaining difference between a fully feathered show dog and Uplandin's low-poly field dog.

## Expected use and limits

The result is ready for Uplandin's existing gait, pointing, honoring, tracking, and retrieving animation paths. It preserves the exact planting solver and the existing lighting contract.

It is not ready to be presented as:

- a photorealistic English Setter;
- a close reconstruction of one individual dog;
- a fully explodable/clickable asset in which muzzle, nose, paws, shoulder mass, and pelvis are separate meshes;
- a fur-card or groomed-coat asset.

If a closer breed/show silhouette is wanted later, the next useful input would be a clean rear three-quarter photograph plus authorization for a separate high-detail LOD with soft fur/feather cards. No additional reference is needed for the current game-ready pass.
