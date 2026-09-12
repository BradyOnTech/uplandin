# Property atlas

The 3D game's Survey / M overlay is now an interactive field map built from the same property data as the hunt. It opens near the hunter, with a Whole property button for orientation. The playable landscape and the 2D game's map are unchanged.

**What changed**

| Before | After |
| --- | --- |
| Coarse terrain cells and overlapping cover rectangles | Shaded relief and interpolated elevation contours sampled from `LandscapeModel`, with cover, moisture and rockiness from the actual property |
| Pheasant habitat was hard to distinguish | Authored cut fields, standing cover, pond shorelines, shelterbelts and fences form a readable habitat map |
| Small labels collided at the entry | Labels avoid one another; nearby hunter, dog and truck markers share a label; only dogs participating in the hunt are shown |
| A fixed view | Drag, wheel, double-click, zoom buttons, arrow keys and pointer-based pinch controls; Find me, Truck and Whole property shortcuts |
| Limited navigation context | North arrow, hunter heading, wind direction, yard scale, contour interval, dog work and distances to the dog and truck |
| A cramped overlay on smaller screens | Responsive portrait and landscape layouts, 44-pixel buttons, keyboard focus containment, Escape to close and preserved browser keyboard shortcuts |
| Terrain work mixed into drawing | A static atlas is built on first opening and cached; subsequent interactions redraw the cached terrain with current markers |

**Controls**

Press M or select Survey to open the atlas. Drag the sheet to pan, scroll to zoom around the cursor, or use the plus and minus buttons. Arrow keys pan while the map is open. Find me and Truck focus those positions; Whole property restores the full extent. Escape or Close returns to the hunt. The map retains its view when reopened.

The atlas shows habitat, paths and landmarks available to the hunter. It does not read or display concealed bird locations. Other properties use their own terrain and cover data; pheasant-specific crop and shelterbelt keys are hidden elsewhere.

**Implementation**

`src/three/maps/surveyMap.ts` owns map transforms, bounded navigation, collision-free label placement, terrain sampling, contour interpolation and atlas painting. `FieldMapSystem` owns the modal and input lifecycle, live hunt markers and cached rendering. The terrain raster is 224 samples wide, the cached canvas is 1536 pixels wide, and display pixel density is capped at two. Terrain sampling does not run while the map is closed or repeat while panning and zooming.

**Validation**

Eight focused tests cover coordinate round trips, cursor-anchored zoom, navigation limits, crowded labels, terrain agreement for Cattail Coverts / Quail Fields / Chukar Ridge, property immutability and contour interpolation. The full suite passes 760 tests in 101 files; TypeScript and the production build pass. The build retains its existing large-bundle warning.

Browser review covered the three properties, map opening and closing, zooming, dragging, location shortcuts, keyboard focus and console errors. Portrait 393 × 852 and landscape 844 × 390 layouts were inspected, including button bounds and overflow. Pointer-based pinch handling is implemented, but physical phone input and device performance have not yet been verified.
