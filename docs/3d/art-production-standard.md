# 3D asset and scene finishing standard

This is the shared authoring and review standard for the full-game objective in [Production finish](production-finish.md). It applies to generated geometry, imported assets, materials, animation and their assembled scenes. It records the target; it does not declare existing content complete.

**Visual language**

Build naturalistic silhouettes with economical geometry, deliberate color groups and restrained surface detail. Animal anatomy may use smoothly shaded surfaces; hard facets should describe rock, wood or a chosen plane rather than expose a primitive's construction. Use the established roles in `src/three/palette.ts` and the property's material family. Quail's warm wooded edges and Cattail's dense wet cover are direction references, not templates to copy into other territories.

Compose a continuous foreground, middle distance and horizon at ordinary hunter height. Vegetation follows moisture, exposure and authored habitat. Surface variation follows material and landform. Distant detail must retain those masses without a visible culling ring, floating patches, giant substitute leaves or smooth replacement surfaces that hide the accepted ground treatment.

**Shared physical contracts**

- Author runtime dimensions in world metres and use the landscape's conversion methods for property coordinates. Validate scale beside the actual hunter camera, dog and bird rather than an isolated viewer.
- Ground props, plants, actors and recovery targets against the authoritative landscape. The survey map and both entries must describe that same place.
- Keep hunt decisions and ownership in the shared simulation. Animation presents actual heading, travel, scent, fall and carry state; it must not move hidden birds or steer a dog directly to an unknown target.
- Match each offered breed and species through silhouette, proportions and motion. A selectable profile or different pigment does not establish a distinct anatomical asset.
- Keep High and Lightweight habitat, routes and hunting rules consistent. Reduce rendering cost while retaining the property's characteristic cover masses and useful sightlines.

**Material and animation integration**

New surfaces must be reviewed with the real terrain, atmosphere and time-of-day lighting. A new canopy or decal cannot silently replace shared ground shading with a mismatched material. Make ownership of cloned materials and shared textures explicit; dispose owned resources without destroying shared ones.

Animate deliberate contacts and weight changes. Review starts, stops, turns, slopes, search-to-point and pickup-to-delivery in motion. Socket alignment is necessary but does not establish a convincing grip; also inspect the visible skin, carried pose and transitions. Review birds during natural launch, flight, fall and recovery at ordinary viewing distances.

**Cost and evidence**

Record the source revision, selected asset, property, seed, entry, camera, light, quality tier, viewport and backing resolution for comparisons. Measure visible draw calls, submitted triangles, texture cost and frame timing where relevant. Extra geometry or texture sampling needs a visible benefit. Frame-rate targets and sustained device requirements are defined in [Production finish](production-finish.md) and [Mobile performance](mobile-performance.md).

Every significant art package needs matched before/after views, motion evidence, and an integrated walking or hunting review appropriate to the change. Inspect the result independently of automated checks. Label staged poses, controlled shots, emulated phones and ordinary input accurately. Preserve rejected candidates when they explain a subsequent decision.

**Acceptance and handoff**

An asset handoff includes its editable source or generator, runtime consumer, measured cost, reviewed evidence and remaining limitations. Generated bitmap assets also retain their prompt and provenance. Source assets belong under `assets/source/`; runtime files belong in the appropriate public asset directory. Keep diagnostic outputs outside source commits unless deliberately selected as documentation.

Accept a bounded improvement when its actual appearance, integration and cost support it. Whole-property and whole-game completion additionally require uninterrupted outings and the broader production requirements. Keep the accepted playable checkpoint separate from evaluation builds so unfinished drafts do not replace a reliable play link.
