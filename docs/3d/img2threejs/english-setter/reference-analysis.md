# English Setter reference analysis

## Reconstruction intent

- Target: a breed-typical blue-belton English Setter for Uplandin's real-time Three.js field view.
- Style: deliberately low-poly and flat-shaded, matching the Firewatch / A Short Hike direction in `ARCHITECTURE-3D.md`.
- Runtime: an articulated game actor driven by the existing dog simulation, not a static hero render or photoreal mesh.
- Scale: approximately 0.55 m at the shoulder in the current game, even though the breed standard describes a larger show-ring adult. Game scale and gameplay readability remain authoritative.
- Reconstruction confidence: high for the side silhouette and head identity, moderate for body width and rear structure, low for unseen paw/toe detail. Bilateral anatomy is inferred by reflection.

## Reference roles

| Reference | Role | Admission |
| --- | --- | --- |
| `standing-profile.jpg` | Primary geometry reference: clean profile, topline, brisket, tuck, leg placement, tail | Pass; orange-belton color is ignored |
| `working-blue-belton.jpg` | Working proportions, point/search energy, blue-belton value pattern, flag silhouette in cover | Conditional; grass occludes the legs and underside |
| `head-three-quarter.jpg` | Skull width, muzzle depth, low ear set, flews, blaze and dark ear masses | Pass for head only; body is cropped |
| `blue-belton-resting.jpg` | Side head planes, neck-to-shoulder flow, coat furnishings and body color distribution | Conditional; reclining pose distorts standing proportions |
| `user-working-three-quarter.png` | Front-three-quarter chest width, face proportions, foreleg alignment, rear angulation and raised working flag | Pass for structure and pose; orange markings are ignored and the tail is pose-driven |
| AKC English Setter standard | Breed morphology cross-check | Pass as descriptive evidence, not image-space measurement |

The photographs show different dogs. The result is intentionally breed-typical rather than a likeness of one animal. Geometry follows the clean standing profile, the user-supplied three-quarter view, and official morphology; coloring and working character follow the blue-belton references.

## Layered observation

### Identity and silhouette

An athletic, medium-large setter with a level-to-slightly-falling topline, deep but not barrel-wide chest, moderate abdominal tuck, long clean neck, long lean head, low close-hanging ears, straight forelegs, angulated rear assembly, and a straight tapering flag tail. The field read depends on the long head/neck line, dropped ear mass, chest-to-tuck transition, rear hock angle, and feathered tail.

### Macro volumes

1. Ribcage: long ovoid volume, deepest at the heart girth and reaching approximately to the elbow.
2. Loin and abdomen: narrower, moderately tucked transition between ribcage and pelvis.
3. Pelvis/haunch: rounded and muscular without becoming blocky.
4. Neck: long tapered bridge, broad at the shoulder and narrow at the skull.
5. Head: equal-looking skull and muzzle lengths with near-parallel upper planes.
6. Limbs: four articulated columns with straight forequarters and visibly angled hindquarters.
7. Tail: continuation of the topline, long and straight with an underside feather fringe.

### Meso forms

- Slight prosternum ahead of the foreleg pivot.
- Shoulder blade laid rearward into the withers rather than a vertical neck-on-box join.
- Brisket keel and chest furnishing as separate silhouette masses.
- Oval skull wider at the ear set, defined stop, square deep muzzle and pendant flews.
- Ear leather set at or below eye level, widening before a rounded hanging tip.
- Broad upper thigh, forward stifle, rearward hock and near-vertical rear pastern.
- Feathering on ears, chest, belly, backs of legs, thighs and tail, represented as a few notched hard-edged masses rather than fur strands.

### Micro identity features

- White ground coat with charcoal/black blue-belton flecking.
- Dark ears and broken head patches separated by a pale blaze.
- Dark nose and eye accents that remain readable without photoreal eye geometry.
- Sparse flank ticks and one or two larger broken patches; no heavy solid body blanket.
- Notched feather edges on the tail, ears, chest and rear legs.

## Material and lighting strategy

All visible colors come from `src/three/palette.ts`. The coat uses the existing warm pale role, charcoal/oxblood-derived markings, and darker value steps for underside and distal legs. No photographic projection, UV texture, alpha hair card, normal map, or external material is allowed. The existing dog Lambert shader and time-of-day response remain the rendering authority after integration.

## Hidden and conflicting evidence

- The clean profile is an orange-belton show dog with more furnishing than the blue field dog; only its anatomy and silhouette are used.
- The working dog is partly hidden by grass and captured in motion; its limb lengths cannot be measured directly.
- No admitted reference supplies a clean rear orthographic view. Rear width is inferred from the head three-quarter, the official description, and bilateral symmetry.
- The user-supplied three-quarter dog carries its tail high in an active stance; that supports the tail rig's range but does not replace the neutral straight continuation of the topline.
- Paw and toe anatomy will remain stylized blocks because it is sub-pixel at gameplay distance.
- Coat clumps are stable hard geometry; loose hair dynamics are out of scope.

## Quality contract

Critical acceptance features:

1. English Setter reads immediately from side, front-three-quarter, and rear-three-quarter views.
2. Long lean head, low dropped ears, deep brisket, moderate tuck, angled rear and flag tail survive the gameplay camera.
3. Neutral, trot, run, tracking, pointing, honoring and retrieving poses preserve joint attachment and foot placement.
4. Blue-belton markings stay subordinate to anatomy and obey the locked palette.
5. High tier stays within roughly 4,000 triangles and 15 dog draw calls; lite can retain the existing geometry.

Must not do:

- Do not route through img2threejs's humanoid component template.
- Do not change simulation behavior to make the model fit.
- Do not introduce photo textures, realistic fur, fullbright coat materials, random per-frame work, or external mesh files.
- Do not accept a macro-shot improvement that weakens the point silhouette at gameplay distance.

## Sources

See `reference-sources.md` for image provenance and licensing. Breed morphology is cross-checked against the [AKC Official Standard for the English Setter](https://images.akc.org/pdf/breeds/standards/EnglishSetter.pdf).
