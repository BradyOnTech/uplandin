# Species hunting doctrine

Every property must feel like a different hunt. A new species is not a reskin, a palette swap, or a new backdrop. Its habitat, route, dog work, bird movement, flush timing, shot window, and recovery loop must ask the hunter to make different decisions.

**Decision**

Use one shared simulation seam with a named doctrine for each property. The doctrine is the source of truth for the hunting language shown in the field card, survey map, HUD guidance, dog cast, runner routes, hunter noise, point pressure, and world flight. Species configs own the bird's temperament inside that property: covey approach, spread, point tolerance, runner stamina, ground response, silhouette, and flight envelope. A map supplies the physical corridor; it cannot rewrite another species into its primary bird.

**Current identities**

- **Quail Fields:** tight bobwhite coveys in plum and grass edges. Give the dog room, follow the scent, let the covey gather, and walk into a close point.
- **Cattail Coverts:** ringneck roosters run the edge of cattails, stubble, and water. Keep the dog close to the line, cut the next pocket, and expect a late, low break.
- **Sharptail Prairie:** wide cover and long casts. The hunter reads wind lanes and distant shelterbelts before committing to a point.
- **Grouse Woods:** short sightlines and nervous flushes. The dog stays close, owns the next opening, and the hunter has a brief timber window.
- **Alder Bottoms:** solitary woodcock in wet ground. The pace is quiet and deliberate; the bird climbs and bends into the canopy.
- **Rimrock Benches:** Hungarian coveys on dry benches. Flank the wind, mark a wild rise, and be ready to circle back over the next contour.
- **Chukar Ridge:** chukar run uphill and flush down the fall line. The route is a switchback and the high side is the tactical advantage.
- **Desert Washes:** desert quail connect shade and water. The dog works the wash chain and the covey breaks fast and low from thorn cover.
- **Oak Canyons:** Montezuma quail hold in oak shadow until the boot moves the draw. The best shot comes from a patient close approach.
- **Timberline Parks:** blue grouse hold on the park edge. Climb to the timber fingers, keep the wind in your face, and cross open ground only after the dog searches the edge.
- **Valley Oaks:** California quail move between oak skirts in tight coveys. Work shade to shade and read how the covey splits around trunks.

**World authoring rule**

Routes and cover are physical hunting tools. A trail should lead to the habitat a species prefers, expose a meaningful flank or approach, and provide a landmark the hunter can remember without a bird marker. Cover should create readable edges, corridors, benches, washes, timber fingers, or shade islands. The survey map shows those authored routes, cover footprints, landmarks, hunter, and dog; it never reveals concealed bird locations.

**Gameplay rule**

The species distinction must survive without the HUD. If the guidance text is hidden, a player should still learn the map's strategy from the dog’s cast, the way birds relocate or run, the shape of the flush, and the route through the landscape. HUD copy explains the decision; it does not replace it.

The dog and encounter authoring share one habitat affinity score. A wet edge, a soft bench, a broken shoulder, an oak draw, or a timber finger is therefore a real objective in the simulation, rather than a label added after a random patch was selected. Species also own flush cohesion: ringnecks, grouse, and woodcock break as individual birds, while bobwhite, partridge, chukar, and quail coveys launch together.

Seasonal condition is part of the field identity too. Timberline Parks carries sparse frost or snow on exposed park shoulders, while the darker spruce fingers stay readable as cover. The condition layer is bounded and instanced so it adds a meaningful high-country cue without changing the mobile geometry budget.

**Performance rule**

The authored doctrine is data. Rendering adapters may use instanced habitat, tiled terrain, and distance culling, but they may not fork the hunt rules or place hidden-bird GPS in the world. High and lite tiers keep the same route, cover, and hunting language while changing density, shadow distance, and detail.

**Acceptance**

- [x] Pheasant, Chukar, Quail, and the other authored properties have named doctrine entries.
- [x] Dog range, cover-edge bias, point pressure, running pressure, and hunter sprint noise vary by property.
- [x] Spatial rises launch from the actual cover position on every authored property.
- [x] Pheasant and Chukar routes expose different physical strategies on the survey map and terrain.
- [x] Dog cover selection and encounter anchors prefer each doctrine's authored ground profile.
- [x] Species profiles carry covey spread, flush cohesion, point tolerance, runner temperament, terrain response, silhouette, and flight envelope independently of map styling.
- [x] Wet bottoms, desert washes, oak canyons, and alpine parks have dedicated visual adapters.
- [ ] Validate each property in normal play and tune values from observed hunt rhythm.
- [ ] Add species-specific shot, retrieve, and scoring presentation after the world pass is approved.
