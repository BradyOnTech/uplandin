# World validation checkpoint

The first browser review after re-enabling tests shows a functioning prototype with substantial visual work still required. The Pheasant entry has better horizon structure and grounded paths, but it is not yet a production-quality reference scene.

**Completed in this pass**

- Corrected Pheasant and Chukar trail coordinates that incorrectly contained drop-point objects.
- Corrected the undefined dog casting doctrine reference and two compilation issues in habitat systems.
- Unified Pheasant harvest rows, terrain paint, pond footprints, water elevation, and rooted wet-margin placement.
- Added batched shelterbelt trees and fuller grass blades. Shelterbelts retain the same layout in both quality tiers and add four rendering batches without shadow casters.
- Subdivided shared route surfaces along their length and sampled both shoulders against the terrain. Softened their edges and corrected the direction of Sharptail wheel-rut width.
- Updated obsolete test fixtures after the move from Quail-only flight behavior to spatial encounters across properties. Added actual geometry, route connectivity, pond consistency, and harvest-boundary checks.

**Observed in the browser**

Reviewed Cattail Coverts from the South Gate at midday in Standard and Lightweight display modes on the desktop browser. The path no longer breaks into large floating triangles. Shelterbelts give the distant field boundaries recognizable structure. Lightweight retains those landmarks but loses considerable grass fullness.

The foreground remains too bare and uniformly brown. The distant trees still need more natural grouping and silhouette variation. Most significantly, the authored South Slough route currently goes through the pond anchor instead of following its shore. Rendering fixes have made this route-design problem easier to see. The dog remains visibly provisional.

**Next work, in order**

1. Reauthor Pheasant routes around water and actual cover edges; verify the same choices on the survey map and on foot. Preserve connected access from both gates.
2. Establish one convincing entry-to-cover sequence with better ground litter, grouped vegetation, recognizable wet margins, and varied shelterbelt spacing. Judge it at walking height in both display modes.
3. Walk a complete Pheasant encounter and compare it with Quail and Chukar. Check that route choice, running birds, dog relocation, and escape directions support different decisions.
4. Measure frame cost and loading behavior on representative mobile hardware before making mobile-readiness claims.
5. Continue the deferred dog presentation, controls, audio, and hunt-flow work after the world and encounter reference is convincing.

**Validation limits**

The production build passes. Automated checks cover simulation and geometry contracts; they do not establish visual quality. Desktop inspection of Lightweight mode is not a mobile performance measurement. No complete on-foot encounter or device performance run was performed in this pass.
