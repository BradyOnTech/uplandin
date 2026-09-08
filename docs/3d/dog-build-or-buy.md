# Dog asset: build or buy

**Recommendation — September 4, 2026**

Evaluate a professionally skinned, animated sporting-dog asset as the next production foundation. Keep the current GSP as a working integration reference and comparison. The custom asset can improve, but its remaining weaknesses require deliberate modeling, skin weighting and animation craft. Further small changes to the procedural generator are unlikely to be the most efficient route to the desired quality.

The current dog checkpoint is frozen while this choice is assessed. No assets have been purchased and no sellers have been contacted.

**What the current checkpoint establishes**

The revised adult GSP has better proportions, a source-guided coat, an economical 11,100-triangle hero, two materials and three distance variants. Its original supplied model remains preserved. Exported geometry now follows the correct walking sequence, and ordinary browser measurements confirm diagonal trot before and after terrain correction. The editable Rigify source contains posing controls while preserving the 18 existing scripted clips.

The remaining visible weaknesses include broad chest webbing, an angular far-hind fold at extreme extension, simplified feet and ears, an unconvincing opening jaw, and some muddy baked coat shading. Correct footfall timing does not establish natural movement. Body weight, shoulder motion, anticipation, contact, turns and hunting performances still need artistic refinement. Rigify provides controls; it does not create that performance or repair the mesh automatically.

See [the current asset review](gsp-asset.md), [labeled gait evidence](gait-pairing.md) and [Rigify workflow](gsp-rigify-workflow.md).

**Options**

| Path | Main work still required | Assessment |
| --- | --- | --- |
| Continue the current custom model | Rework difficult joint topology and weights; refine face, paws and coat; animate convincing performances | Feasible, but substantial specialist art work remains |
| Buy a strong rigged and animated base | Match the art direction, optimize it, adapt clips and grounding, add hunting interactions | Preferred candidate for a faster and more reliable quality improvement |
| Buy a base and commission hunting animation | The same integration work, with an animator producing the distinctive point and retrieve performances | Strongest route if the stock locomotion is good but hunting clips are absent |

**Reuse across breeds**

| Variation | Practical reuse |
| --- | --- |
| Different coats on the same GSP | Mostly textures and materials, with the same mesh and animation |
| GSP, English Pointer, Vizsla and Weimaraner | Potentially share a skeleton and motion library, with genuine head, ear, chest, body and tail changes; recheck weights and stride |
| Labrador | Shared logical rig is possible, but the heavier head, neck, torso and tail need a distinct mesh variant and motion adjustments |
| Setters, spaniels, Brittanys and wire-haired dogs | Reuse behavior and some animation foundations; distinct proportions, ears and coat geometry need more work |

Recoloring one mesh cannot convincingly produce every breed. Retargeting transfers motion between skeletons; it does not transfer anatomical correctness or good skin weights automatically. A small family of related meshes is a better target than one universal dog.

**What to buy**

Prioritize demonstrated anatomy and deformation, especially shoulders, hips, elbows, paws and mouth. Require visible-foot front and side locomotion footage rather than relying on a posed beauty render. Inspect walk, trot, lope, start, stop and turns at normal speed and slow motion.

The delivery should include the editable mesh, weights, skeleton, UVs, textures and real animation clips. A native Blender file with usable controls is preferable; complete FBX or GLB can also be integrated. In-place motion is convenient, while editable root-motion clips can be converted. Confirm the specific license covers commercial game modification and browser distribution, as well as project collaborators. A marketplace label such as “rigged” or “royalty free” is not the full specification.

Stock assets may still need pointing, scent recognition, stalking, pickup, carrying and delivery performances. Purchase price alone is not the total cost of that work.

**Screening shortlist — prices checked September 4, 2026**

These are candidates for evaluation, not approved production assets. Listing specifications are seller claims; previews have been sampled, but purchased source files have not been imported or audited.

| Candidate | Advertised delivery | Fit and remaining questions |
| --- | --- | --- |
| [Nyilonelycompany German Shorthaired Pointer](https://www.cgtrader.com/3d-models/animal/mammal/german-shorthaired-pointers-dog), $40 on CGTrader | Blender 3.6.5+/4, FBX and GLB/glTF; 30 animations; 52,819 triangles, one material and 4K textures | Closest breed match. Adult proportions make it worth screening first. Needs optimization, restrained coat treatment and a close deformation review. The [creator's animation viewer](https://sketchfab.com/3d-models/german-shorthaired-pointers-dog-game-ready-e42118bf5add49e09b13aa86d175907f) lists walk, trot and run, but no named point, scent, pickup, carry or delivery clips. |
| [Red Deer/billl90 Labrador](https://www.cgtrader.com/3d-models/animal/mammal/dog-labrador-2df74783-d181-4939-bbe4-7cd833f1ecd5), $30 on CGTrader | Blender 2.79 and FBX; approximately 14k triangles, 57 bones, four LODs and a 2,700-triangle mobile model; 100+ animations including walk, trot, run, turns, pickup and transitions | Useful inexpensive animation/import trial and a hunting breed in its own right. Conversion into a GSP would require substantial anatomy and weight work. Modern Blender compatibility, controller usability and clip quality remain unverified. |
| [Red Deer Dogs Big Pack](https://www.cgtrader.com/3d-model-packs/dogs-big-pack), $150 on the main CGTrader listing | 19 breeds, Blender/FBX, 100+ animations, approximately 13–17k triangles per breed, LODs and mobile variants | Possible later breed library. Includes Labrador, Golden Retriever and Beagle, but no GSP or setter. Bone counts vary, so shared animations still need checking. Evaluate an individual dog before buying the collection. |

The same [Nyilonelycompany GSP is listed at $30 on GameDev Market](https://gamedevmarket.net/asset/german-shorthaired-pointers-dog). Choose the storefront based on its actual delivery and license, as well as price. Both [CGTrader's terms](https://www.cgtrader.com/pages/terms-and-conditions) and [GameDev Market's terms](https://gamedevmarket.net/terms-conditions) contain restrictions concerning extraction or standalone redistribution. Confirm the intended browser-delivered asset packaging and breed modifications under the selected license before purchase; the phrase “royalty free” alone does not answer that question.

[MalberS Skye](https://www.fab.com/listings/fa25a2b9-0178-4805-97d9-5caeb5e2e82f) is a reserve animation-library candidate with 298+ advertised animations, but its Border Collie anatomy is a poorer first GSP match. The listing names Unity and Unreal formats; editable portable source delivery has not been confirmed. The older [3DRT GSP listing](https://www.cgtrader.com/3d-models/animal/mammal/3drt-german-shorthaired-pointer) is excluded from the actionable shortlist because availability and its custom license remain unverified.

The art target is believable adult anatomy and motion with simplified geometry and quiet materials. A realistic source model can support that direction after deliberate adaptation. A high polygon count or detailed fur texture is not itself evidence of a better result, and none of these listings establishes physical mobile performance.

**Integration plan**

Preserve a purchased asset's good deform skeleton and skin. Adapt our renderer's semantic bone and animation mappings to it instead of rebinding it to the current 39-bone convention. The shared hunt simulation, career progression and world systems can remain intact.

Validate one GSP candidate first: import it in Blender; review deformation and clip quality; export a browser version with restrained materials and distance variants; then compare it with the current dog in the same Quail Fields lighting, camera and complete hunt. Review point and pickup at close range. Derive further breeds only after this one-dog comparison succeeds.
