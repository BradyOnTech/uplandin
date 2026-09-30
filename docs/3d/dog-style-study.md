# Dog art style study: smooth or faceted

**September 29, 2026 (design pass 2 the same day)**

Uplandin has two dog presentations. The GSP uses the smooth, skinned single-mesh generator (`generatedGsp.ts`). The English Setter uses the faceted, articulated low-poly sculpt (`subsystems/dog.ts`). Because each breed existed in only one style, the two styles could not be compared fairly. This pass builds each breed in both styles, adds a style switch, and applies the same search and locomotion changes to all four dogs.

## How to compare

- **Pose bench:** `tools3d/dog-comparison.html` shows a 2×2 grid: GSP and English Setter, each in the smooth and faceted styles, on the same ground, light and camera. `layout=smooth|faceted|gsp|english-setter` narrows the grid, and `zoom=1.5` moves the camera closer. Each panel has a Play link into Quail Fields.
- **In the field:** `index3d.html?dogstyle=smooth` or `?dogstyle=faceted` applies one style to every dog, including a brace. Without the parameter each breed keeps its current default (smooth GSP, faceted Setter).
- **From the menus:** hunt preparation → **Dog** step. The live turntable has **Smooth / Faceted / Compare both**; Compare shows your chosen breed and coat in both styles side by side. The same setting is under Settings on the home screen and in preparation. The choice is remembered in `uplandin.3d.dogstyle` and applies to every dog.

## Design pass 2: both styles redesigned

The first pass mostly carried the smooth GSP's look over to the setter. The second pass redesigns the anatomy, silhouette, markings and shading of both styles.

### Smooth style (both breeds, `dogs/generatedGsp.ts`)

- **Head carriage:** the neck is re-authored to rise to a head carried well above the withers, instead of level with the back. Running gaits lower it into a working reach; point and pickup still solve from the raised carriage.
- **Trunk:** more compact behind the ribcage (a GSP is barely longer than tall, a setter a little longer). It has a tucked loin, a short sloping croup, a high tail set and withers as the top of the outline. The hind hip and tail joints move with the shortened loin.
- **Legs:**
  - Fore: pastern, wrist knob, a tapering cannon, forearm muscle below the elbow, olecranon, upper arm, point of shoulder and scapula.
  - Hind: metatarsus, point of hock, gaskin, stifle, a broad first thigh and hip.
  - Setter feathering deepens only the rear edge.
- **Shading:** baked contact occlusion darkens the underside, the inner limbs and the armpit and groin creases. A soft sky rim separates the silhouette from grass and sky. Both are in the one existing material.
- **Details:**
  - The GSP's docked tail tapers to a thick, blunt tip rather than a needle.
  - Feet are compact and arched.
  - The setter's brisket feathering is a broad apron instead of a spike.
- **Smooth English Setter:**
  - **Head:** the GSP head surface reshaped into a setter conformation (`setterHeadVertex`): longer skull, stop, square muzzle, low-set feathered ears.
  - **Furnishings and tail:** brisket, belly, forearm and thigh furnishings, and a long flag tail held high on point.
  - **Coat:** a belton shader for all five coats.

### Faceted style (both breeds, `dogs/facetedSculpt.ts` + `subsystems/dog.ts`)

The rig, gaits, contact solver and pivots are unchanged. The geometry is rebuilt:

- **Construction:** continuous eight-sided anatomical sections replace stacked hex boxes. Authored landmarks are refined with smooth in-between sections, so the planes are even and deliberate. The result is a keeled brisket, raised scapular planes, a crested neck, a sloping croup, muscled upper limbs, tapering cannons, faceted joint knuckles and domed feet.
- **Heads:** new heads for each breed, built from a side-profile table: occiput, flat skull, cheeks, brow, stop, and a square muzzle with flews. They have a separate nose, eyes with a lid facet, and folded two-plane ears (the setter's with a fringe).
- **Tails:** the GSP has a docked, tapering tail. The setter has a shorter pole with a lens-shaped feathered flag.
- **Setter furnishings:** feathering is built as thin lenses instead of jagged shards.
- **Markings:** painted per facet quad from a body-space pattern, so markings step along the facet grid in clean blocks:
  - GSP liver plates, saddle and tail set
  - roan facet variation
  - belton hood and ears
  - tricolour tan points
- **Ticking and flecks:** small diamonds laid flush inside facets.
- **Legs:** lower-leg tone is close to the coat instead of reading as stockings.
- **Shading:** the lee-side shade of the faceted coat shader is lifted (tint and core-shadow terms), so the far side reads as shade rather than slate grey.

## Search and movement (shared simulation, all dogs)

Measured with a handler walking a public trail at 1.5 m/s for three minutes, without birds and at level 7. Before → after:

| Property / breed | Ahead of handler | Behind > 5 m | Line crossings / min | Path turns > 6 rad/s |
|---|---|---|---|---|
| Quail Fields · GSP | 94% → 99% | 1% → 0% | 4.8 → 5.5 | 9.9% → 0% |
| Quail Fields · Setter | 93% → 100% | 2% → 0% | 2.1 → 4.8 | 7.3% → 0% |
| Sharptail · GSP | 76% → 95% | 14% → 2% | 4.8 → 5.5 | 4.0% → 0% |
| Sharptail · Setter | 83% → 99% | 8% → 0% | 4.5 → 5.5 | 2.9% → 0% |
| Chukar · GSP | 74% → 96% | 11% → 2% | 3.8 → 7.2 | 2.3% → 0% |
| Chukar · Setter | 82% → 98% | 9% → 0% | 3.8 → 4.5 | 2.9% → 0% |
| Pheasant · GSP | 57% → 57% | 10% → 12% | 4.8 → 6.5 | 17.8% → 0% |
| Pheasant · Setter | 51% → 53% | 14% → 17% | 5.5 → 5.1 | 14.4% → 0% |

- **Search momentum** (`Dog.advanceSearch`): a running dog brakes in proportion to how hard it must turn, sweeps through the turn on a speed-dependent radius (about 10 m/s² of lateral acceleration), and accelerates out. Before, 7–18% of running frames were near-instant pivots at 7.7 rad/s. Steering still decides where the dog goes; only the path is physical. Legacy screen-space search is unchanged.
- **Quartering the handler's front:** the dog tracks the handler's direction of travel. Cover-beat choice prefers ground ahead of that line and swings to the opposite side after each beat. When no cover is in reach, the open-ground sweep becomes long casts across the front. Only public habitat is ordered this way; hidden birds are never read.
- **Pheasant:** its deliberate rim-and-run local search keeps its existing behaviour relative to the handler.

## Verification

- **Tests:** new tests are `test/generatedSetter.test.ts`, `test/dogStyle.test.ts`, `test/fieldQuartering.test.ts` and `test/facetedSculpt.test.ts`. The pickup clearance test now measures the nose from the head joint's bind position, because the raised head carriage moves it. `reachableCoverSearch` now allows 1.5 s for the two wind entries to separate, because the dog curves onto its cast line instead of snapping onto it.
- **Build:** TypeScript and the production build pass.
- **Visual review:** headless staged captures (bench and capture-mode field). They are not frame-rate or physical-device evidence.
- **Bench options:** `tools3d/dog-comparison.html` also takes `layout=gsp-smooth|setter-smooth|gsp-faceted|setter-faceted`, `view=rear|rear-quarter` and `focus=head|feet` for close review.
- **Menu thumbnails:** the dog pictures (`public/art/menus3d/dogs/*.webp`) still show the old models and should be re-rendered once a style is chosen.

## Menus and dog selection (September 29, 2026)

Hunt preparation is rebuilt as four steps — **Ground, Dog, Gear, Day** — with a rail that summarises each choice and a launch bar that always shows the whole outing.

- **Dog step:** a live 3D turntable (`src/three/dogPreview.ts`) runs the real field renderers on a small sunlit stage. Drag to turn; Standing / On point / Trotting / Running. A second dog appears beside the first.
- **Breeds in 3D:** only the GSP and English Setter have models, so only they are offered for 3D hunts. Existing career dogs of other breeds still hunt (with the setter body, labelled on their kennel card). The classic 2D view keeps all eleven breeds.
- **Coats:** every modelled breed shows coat swatches drawn from the model palettes. Quick hunts save `coatId` / `coat2Id`; career dogs save `coatId` on the kennel dog (`commitDogCoat`). Launch links carry `coat` and `coat2`.
- **Portraits:** `public/art/menus3d/dogs/<breed>-<style>[-<coat>].webp`, rendered from the same preview with `tools3d/dog-portrait.html`. They stand in while WebGL loads (or if it is unavailable) and appear on the home screen and the field arrival card.
- **Picking the house style:** in `src/three/dogs/dogStyle.ts`, set both `DEFAULT_DOG_STYLE` entries to the chosen style and set `DOG_STYLE_SELECTABLE = false`. Every style control disappears and stored choices are ignored; the Compare button goes with it.

## Deciding

- **Smooth:** reads as a grounded, naturalistic animal at play distance. Adding a breed is mostly a head transform, furnishings and a coat shader on one skeleton.
- **Faceted:** after pass 2 it is a coherent low-poly style with a strong graphic identity. The facet-block markings and flecks read clearly in grass, and its whole sculpt is data-driven section tables, which also makes new breeds cheap.

Choose after playing both in the field.
