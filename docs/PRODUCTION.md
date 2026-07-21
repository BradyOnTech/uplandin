# Uplandin — Production Roadmap (executable)

Living plan from **current main** to a production-quality, visually
seamless GBA-scale hunting game. Companion to `docs/ART.md` (prompts +
style) and `docs/DESIGN.md` (sim). Check items off as they ship.

**Hard constraint (current):** no human hand-drawn true-pixel finish and no
hired pixel artist. All art is AI-generated + **automated** post
(palette lock, nearest-neighbor sizing, edit-chain consistency). Human
Aseprite pass is an **optional future** if this path cannot reach
acceptable quality — not a gate on any phase below.

---

## North star

One continuous fiction:

- The dog you watch is the dog that finds birds.
- The cover you see is the cover that hides them.
- Every region feels like a different place.
- No material breaks (painted dog next to blob breed, real flush plate
  under rectangle pheasants, hunter as a 9×12 rectangle).

**Visually seamless** at 480×270 means: no prototype tells in a trailer
minute; readable cover/wind/point; one outline/palette/scale language;
motion that sells mass (lope, rise, fold, cast).

**Production realism** means systems you can *see*, not more invisible AI.

---

## Current baseline (do not re-litigate)

| Area | State |
|------|--------|
| Sim / career / seasons / brace / fieldcraft | **Shipped** |
| Flush juice (fan, waves, shadows, feathers, weather, depth) | **Shipped** |
| Bitmap font | **Shipped** |
| English Setter sheet (4-run + point + heel + retrieve) | **In-engine** (AI pipeline) |
| Hunter walk/idle sheet | **In-engine** |
| Southern Plains tiles + cover stamp + organic fringe | **In-engine** (seam-check PASS) |
| SP flush plate + bobwhite sheet | **In-engine** |
| Cover objectives + edge work + wind-aware cast | **Shipped** (sim) |
| Field presentation (Y-sort, shadows, wind tell, fades) | **Shipped** |
| Shell icons + reticle + eject + hit-pause | **Shipped** |
| Other 10 breeds, 6+ regions art, 13 birds | **Placeholder / missing** |
| Menus / map / title | **Prototype chrome** |
| Palette quantize script | **Shipped** (`scripts/art/`) |

---

## Art pipeline (AI-only — this *is* the finish)

Replace “hand-pixel” with a repeatable machine path. Every shipped asset
must pass this gate before `public/art/`.

### Pipeline steps

1. **Style lock** — field mockup + `field-view-palette.gpl` are law.
2. **Generate** — Imagine / edit-chain from existing breed or species base;
   field mockup for palette only (not busy grass density).
3. **Extract cells** — uniform grid, no dividers; subject baseline-aligned.
4. **Native size** — NN resize to target (dog 32×20, bird 44×28, tile 16×16,
   hunter ~12–16 tall, plates 480×270). Prefer generating compositions that
   *read* at that scale, not heroic downscales from 1280 alone.
5. **Palette quantize** — map every pixel to nearest locked palette color
   (+ forced accents: blaze orange, cream HUD, pure outline dark).
6. **Cleanup pass (scripted)** — drop orphan single pixels, force 1px dark
   outline on silhouettes where possible, strip near-white to alpha for
   sheets.
7. **QA checklist** (manual 30s look at `@4x` / `@6x` preview):
   - Silhouette jizz (tennis-ball quail, plank point, calm tile).
   - Cover tile darker than open at a glance.
   - No long pointed songbird wings on gamebirds.
   - Sheet loops without pop (gait / wingbeat).
8. **Install** — `docs/art/` archive + `public/art/` runtime; register in
   `DOG_SHEETS` / `BIRD_SHEETS` / `FIELD_TILESETS` / `FLUSH_BACKDROPS`.
9. **Structural test** — PNG dimensions + scene frame indices (pattern:
   `test/setter-sheet.test.ts`).

### Scripts (to add / maintain under `scripts/art/`)

| Script | Job |
|--------|-----|
| `palette-quantize.py` | Index PNG to `.gpl`; write alpha sheets |
| `sheet-pack.py` | Pack N frames into uniform cells |
| `tile-seam-check.py` | 2×2 / 3×3 composite; fail if edge delta too high |
| `qa-preview.py` | Emit `@4x` nearest previews for review |

### Explicitly deferred

- Human Aseprite re-pixel of every sheet.
- Commissioned consistency pass.
- Raising resolution above 480×270 internal.

If AI+script quality plateaus below “trailer-clean,” revisit human finish
as a **spike**, not a silent dependency.

---

## Phase map (execute in order)

### Phase 0 — Foundations (unblocks everything)

**Goal:** machine finish path + presentation seams that make *existing*
assets look intentional.

| # | Task | Acceptance | Primary files |
|---|------|------------|---------------|
| 0.1 | Palette quantize + sheet-pack scripts; run on setter, bobwhite, SP tiles | Scripts in repo; re-exported `public/art/*` still load; tests green | `scripts/art/*`, `public/art/` |
| 0.2 | Structural tests for bobwhite sheet + SP plate dimensions | Vitest asserts PNG + FlushScene keys | `test/*.test.ts` |
| 0.3 | Field **Y-sort** (hunter, dogs, landmarks by y) | Actors correctly occlude; no z-fight | `FieldScene.ts` |
| 0.4 | Field **ground shadows** under hunter + dogs | Soft ellipses, scale with sprite | `FieldScene.ts` |
| 0.5 | **Wind tell** — grass lean particles and/or HUD chevron from `windAngle` | Player can guess wind without debug | `FieldScene.ts`, maybe `weatherFx.ts` |
| 0.6 | **Scene transition** field→flush (fade/iris 150–250ms) | No hard cut | `FieldScene` / `FlushScene` / small helper |
| 0.7 | Integer camera / already `roundPixels` audit; clamp scroll | No subpixel shimmer on follow | `FieldScene.ts`, `main.ts` |
| 0.8 | Real **shell icons + reticle** (16px AI sheet, quantized) | Flush UI not red rectangles | `FlushScene.ts`, `public/art/` |

**Phase 0 progress:** 0.1–0.6 + 0.8 **landed** (2026-07-19): `scripts/art/palette-quantize.py`,
`tile-seam-check.py`, `qa-preview.py`; field Y-sort, shadows, wind lean ticks,
field→flush fade + flush fade-in; shell/crosshair icons + eject flick;
`test/art-assets.test.ts`. 0.7 already satisfied by `pixelArt`/`roundPixels`.

**Exit:** one Southern Plains hunt with setter looks *directed*, not
“sim + random PNGs.”

---

### Phase 1 — Vertical slice seal (trailer-able, one place)

**Goal:** English Setter + Southern Plains + bobwhite + hunter — **zero
placeholders** in a normal career hunt path for that setup.

| # | Task | Acceptance |
|---|------|------------|
| 1.1 | **Hunter sheet** — side walk 4-frame + idle; blaze cap, tan pants; pipeline finish | Field never uses `makeTextures` hunter for SP career with painted dog |
| 1.2 | Setter **heel + retrieve** frames (1–2 each); wire anim state machine | Point / run / heel / retrieve never drop to blob |
| 1.3 | SP **tiles re-gen** — calm seamless open; cover luminance ≤ ~0.5× open; mesquite full-bleed; two-track; pass `tile-seam-check` | 2×2 open has no obvious grid |
| 1.4 | Cover draw uses **tile cover stamp** + organic fringe (not only tufts on flat grass) | Cover edge readable at 1× |
| 1.5 | Bobwhite re-pass through full pipeline (silhouette gate) | Flying tennis ball at 44×28 |
| 1.6 | Optional: ringneck **or** sharptail sheet for same plate (one more species) | Second species not a rectangle on SP plate |
| 1.7 | Facing + flip + short turn for dog/hunter | No moonwalk |
| 1.8 | Shot juice: shell eject flick, 1–2f hit pause | Gun feels physical |
| 1.9 | Flush plate optional **parallax** split (sky / hills / fg) if cheap | Depth without new gameplay |

**Exit gate (trailer minute):**

- [x] Only setter + hunter painted actors in field
- [x] SP tiles + cover, no solid `area.grass` fill for that region
- [x] Flush: SP plate + sheet birds + real shells/reticle
- [x] Wind tell + dog edge work + wind cast all visible
- [x] Fade into flush; weather not the only atmosphere
- [x] No `makeTextures` dog/hunter on screen for this path (painted sheets preferred)

**Phase 1 progress:** vertical slice **sealed** (2026-07-19) — hunter sheet,
setter heel/retrieve, SP tiles re-gen (cover/open ~0.35, seam PASS), cover
tile stamp, dog pose SM, hit-pause + shell eject.

---

### Phase 2 — Presentation & systems that match the eyes

**Goal:** sim and art describe the same world.

| # | Task | Acceptance |
|---|------|------------|
| 2.1 | Dog **anim state machine** — run / cast-trot / point / heel / retrieve / honor tint+pose | State changes never wrong frame |
| 2.2 | **Fatigue gait** — lower frameRate / slight tint when `winded` | Winded is visible |
| 2.3 | **Scent check** micro-behavior (brief pause/heading when first hitting scent) | Optional; keep subtle |
| 2.4 | Field birds: tiny “hidden” / “downed” sprites (10–13px) instead of debug rects | Dev off = still readable falls |
| 2.5 | Audio glue pass — cover vs open footfalls, wingburst, shell, bell curve | Eyes closed still know state |
| 2.6 | Minimap / whistle btn use panel chrome from icon sheet | Less prototype UI |

**Phase 2 progress:** **landed** (2026-07-19) — `Dog.gait` / `scentCheck`; cast=trot,
track/work=run rates; scent freeze + soft audio; downed field sprites always
on; hunter footfalls cover-vs-open; whistle/minimap olive panels; winded tint
+ slow already from Phase 1 retained.

### Playfeel pack (post Phase 2 playtest)

- [x] **End hunt** — field UI + Esc/E; `endHuntEarly()` writes off remaining birds
- [x] **Hunter scale** — `HUNTER_SHEET_SCALE = 1.45` vs setter
- [x] **Denser field vegetation** — more tufts/landmarks/cattails/open flecks
- [x] **SP multi-backdrop pool** (3 plates) + mid-ground brush that blocks shots
- [x] **Shotgun** rest → mount → lag-aim (`gunAim.ts` + `shotgun-side.png`)
- [x] **Field look (Pokémon/mockup)** — multi-tone open v3, ragged cover + fringe
  (`fieldDraw.ts`), prop sheet (oak/shrub/cattail) Y-sorted scatter

**Do not** add deep pathfinding or multi-pass AI until 2.1–2.2 feel good.

---

### Phase 3 — Content factory (expand under law)

Only after Phase 1 exit. Batch work; each batch ends in a playable commit.

#### 3A — Dogs (field star)

Order by career visibility / brace diversity:

1. GSP (all-rounder default feel)  
2. English Pointer  
3. Brittany (palette-swap friendly pair later)  
4. Vizsla  
5. Then wirehairs / setters / Griffon  

Per breed: **4-run + point** minimum; heel/retrieve can share skeleton
until pose variants exist. Edit-chain from setter topology where possible;
**palette-swap** Brittanys / similar silhouettes.

Wire each into `DOG_SHEETS` + structural test.

#### 3B — Regions (place is place)

Per region pack:

1. **Tileset** (open, cover, landmark, path/edge) — cover darker rule  
2. **Flush plate** 480×270 empty sky  
3. Optional snow/rain plate variants for top regions  

Order:

1. Southern Plains *(done — polish only)*  
2. Prairie Pothole  
3. North Woods  
4. Great Basin  
5. Sonoran  
6. High Rockies  
7. Pacific Valleys  

Register `FIELD_TILESETS` + `FLUSH_BACKDROPS`.

#### 3C — Birds (flush identity)

Pipeline + silhouette template in ART.md. Batch:

1. Bobwhite *(done — polish)*  
2. Ringneck + hen  
3. Sharptail, Hun  
4. Woodcock, ruffed  
5. Desert quail cluster (palette swaps where jizz matches)  
6. Chukar, prairie chicken, blue grouse, mountain quail, etc.

`BIRD_SHEETS` + size scale already in engine.

#### 3D — Meta chrome

1. Title plate (`ART.md` prompt)  
2. US map plate  
3. Icon sheet (shell, bell, beeper, GPS, whistle, weather glyphs, truck)  
4. Kennel portraits optional  
5. Breed / area / quick screens use panels + icons, not only rects  

---

### Phase 4 — Cohesion audit & ship hardening

| # | Task | Acceptance |
|---|------|------------|
| 4.1 | Screenshot matrix: every region × weather × flush | Outliers re-gen or quantize |
| 4.2 | Full palette enforce on all `public/art` | Script exit 0 |
| 4.3 | Atlas JSON (or documented frame maps) for dogs/birds | No magic index drift |
| 4.4 | Perf: field RT/tufts OK on low-end; no GC spikes on flush | 60fps target desktop |
| 4.5 | PWA / offline still works with new asset weight | SW cache list updated |
| 4.6 | README “how to play” + trailer stills from slice | External-facing |

---

## Priority stack (when in doubt)

1. Phase 0 presentation + pipeline  
2. Phase 1 vertical slice (one honest place)  
3. Phase 2 visible dog craft  
4. Phase 3A dogs → 3B regions → 3C birds → 3D meta  
5. Phase 4 audit  

**Never** generate all 13 birds before Phase 1 exit.  
**Never** add invisible dog genius before poses/tells.  
**Never** block a phase on human Aseprite.

---

## Definition of “production quality” (whole game)

- [ ] Every career region has tiles + flush plate (no solid fill field, no drawn-only sky)  
- [ ] Every breed has at least run+point sheet  
- [ ] Every species has flush sheet (or documented palette-swap parent)  
- [ ] Hunter never a rectangle  
- [ ] Title + map are plates, not navy voids  
- [ ] Cover/open and wind are teachable without text  
- [ ] AI pipeline + quantize is how art lands; matrix audit clean  
- [ ] Full vitest green; PWA install path works  

---

## Vertical slice definition of done (Phase 1 exit)

Playable path: **Quick Hunt or career → Southern Plains area → English
Setter → full hunt → flush → summary** with:

1. No placeholder dog/hunter textures  
2. SP tiles + readable cover  
3. SP flush plate + bobwhite sheet birds + shell icons  
4. Wind tell + edge/wind cast behaviors  
5. Field↔flush transition  
6. Assets through palette quantize pipeline  

That minute of footage is the quality bar for every later region/breed.

---

## Implementation notes for agents

- Keep `src/game/**` pure TS + tests; scenes stay thin.  
- New knobs → `docs/TUNING.md`; design bullets → `docs/DESIGN.md`.  
- Art prompts stay in `docs/ART.md`; **this file owns order and gates**.  
- Prefer edit-chain from existing mid sheets over fresh gens for same subject.  
- Ship behind fallback maps (`DOG_SHEETS`, etc.) so incomplete packs don’t crash.  
- One playable commit per batch; don’t merge broken sheet dimensions.

---

## Tracking

Update the checkboxes in Phase 1 exit and the production definition as
work lands. When a phase completes, note the date in git commit message
(`prod: phase 0 complete`).
