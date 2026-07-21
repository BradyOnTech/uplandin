# Uplandin — Art Direction & Generation Prompt Kit

The target: **GBA-era top-down pixel art (Pokémon Emerald / FireRed
structure) with the palette and mood of a vintage upland hunting print.**
Keep the tile grid, clean 1px outlines, and flat 2–3-tone shading that make
that era readable; drop the saturation and chibi cuteness. October light,
not candy.

Why it fits: the game renders at 480×270 — exactly 2× a GBA screen — so
GBA-scale assets (16px tiles, 16–24px overworld sprites) are proportionally
correct with no rework.

## Workflow

1. **Mockups first.** Generate the three scene mockups below until one
   *feels* right. This locks the style.
2. **Extract the palette.** Pull ~24 colors from the winning mockup
   (Aseprite: indexed mode). This palette is law for every later asset.
3. **Assets against the reference.** Generate each sprite/tile prompt with
   the winning mockup attached as a style/image reference. Consistency
   comes from the reference, not the words.
4. **True pixels.** General models (Midjourney, GPT-image) fake pixel
   grids — use their output as reference, or downscale nearest-neighbor in
   Aseprite and hand-clean. Pixel-native tools (Retro Diffusion, PixelLab,
   Recraft pixel style) output real grids and animation frames — prefer
   them for final sprites.
5. **Real sizes.** Field sprites ~16–24px, flush-view birds ~40–48px wide,
   tiles 16×16. Ask for sprite-sheet rows on plain white/transparent
   backgrounds. Never generate big and shrink blindly.
6. **Integer scale is law.** Every sprite is authored at the size it
   displays; scenes may draw at ×1 or ×2 ONLY. Fractional nearest-neighbor
   scaling makes uneven fat/thin pixel columns — the least GBA thing a
   screen can do. (Standing violation: the hunter sheet draws at ×1.45;
   the directional hunter sheet below retires it by being authored at
   native 20×28.)

## Locked reference (step 1 done)

`docs/art/field-view-mockup.png` is the blessed field-view style
reference; `field-view-palette.gpl` (24 colors) is the palette — law for
every asset from here on. Caveats when using the mockup as an image
reference: it is painterly 3/4 with continuous grass — for tiles, take
its palette and mood but keep the prompts' flat/seamless/bounded-cover
language; its sprites are ~4x final scale (fine — detail simplifies down);
its setter spotting is bolder than belton (self-resolves at 24px).

`docs/art/flush-view-mockup.png`: **background blessed, birds rejected.**
The plate (straw ground, cattail wings, bare treeline, big overcast sky)
is near-final flush-backdrop composition on the locked palette — re-run
it with "empty sky, no birds" to produce the shippable Southern Plains
backdrop. The birds have the wrong jizz (slim, long-winged, songbird-ish;
a flushing quail is a chunky round body on short rounded whirring wings)
and mockup covey composition is moot anyway — the engine launches and
scatters bird sprites at runtime. All bird art comes from the
sprite-sheet prompts below, never from scene mockups.

**First shipping assets are in-engine**: `flush-backdrop-southern-plains`
(the bird-free plate) draws behind every Southern Plains flush, and the
bobwhite three-frame sheet flies with a 14fps wing-whir and folds on the
shot. Shipping copies live in `public/art/`; sources and previews stay
here in `docs/art/`. The pattern to extend: add a plate per region to
`FLUSH_BACKDROPS` and a sheet per species to `BIRD_SHEETS` in
FlushScene — regions and species without art fall back to the drawn
placeholders. Next: remaining bird sheets, title screen, field tiles.

## The master style block

Prepend (or attach as reference-image notes) to every prompt:

> 16-bit pixel art in the style of Game Boy Advance-era top-down RPGs.
> Muted naturalistic autumn palette: straw gold, russet, olive green,
> slate gray, cream, oxblood. Clean single-pixel dark-olive outlines, flat
> cel shading with 2–3 tones per surface, no anti-aliasing, no gradients,
> crisp pixel grid. Subdued and painterly rather than cartoonish — the
> mood of a vintage upland hunting print, overcast October light.

## Scene mockups (do these first)

**Field view**
> Top-down 2D pixel art game screenshot, 480×270, GBA
> Pokémon-overworld perspective. An autumn prairie: dry straw-colored
> grass with darker olive patches of cattail slough cover, scattered
> russet shrubs and a few bur oaks. A small hunter sprite in blaze-orange
> cap and tan brush pants walks upfield; twenty pixels ahead an English
> Setter is frozen on point, tail high, one paw lifted. Thin cream
> monospace HUD text in the top-left corner. [style block]

**Flush view**
> 2D pixel art game screenshot: Duck Hunt reimagined as a GBA upland
> hunting game. Low first-person view over dry prairie grass, a covey of
> bobwhite quail bursting upward into a pale overcast sky, wings
> mid-beat, a thin bare treeline on the horizon. A simple circular
> crosshair reticle, two red shotshell icons in the lower-left. [style block]

**Title screen**
> Pixel art game title screen: a hunter and a pointing dog silhouetted on
> a grassy ridge against a huge dawn sky, long grass in the wind,
> "UPLANDIN" in chunky hand-lettered pixel type across the sky. [style block]

**Weather variants** — re-run the field mockup appending one of:
> …under fresh snow: white ground, tan grass poking through, gray sky ·
> …in rain: darkened wet grass, gray-green cast, drizzle streaks ·
> …hot September: bleached pale grass, hard light, dusty haze ·
> …hard frost morning: silvered grass tips, cold clean light, long shadows

## Dog sprite sheets

One prompt per breed. Template:

> Pixel art sprite sheet on a plain white background: one small hunting
> dog at GBA overworld scale, each pose roughly 24×16 pixels, side view,
> arranged in a row: (1) running, extended stride, (2) running, gathered
> stride, (3) LOCKED ON POINT — body rigid and horizontal, tail straight
> up, one foreleg lifted, (4) standing alert, (5) sitting at heel, (6)
> carrying a quail gently in its mouth. Coat: {COAT}. [style block]

Coats (accurate; the point pose is the money shot):

| Breed | {COAT} |
|---|---|
| German Shorthaired Pointer | liver-brown head, white body densely ticked with liver, short tail |
| English Pointer | lean white body with large liver patches, high straight tail |
| English Setter | white coat with fine blue-black belton speckling, feathered tail and legs |
| German Wirehaired Pointer | wiry liver-and-gray coat, bearded muzzle, bushy eyebrows |
| Vizsla | sleek solid rust-gold all over, lean build |
| Pudelpointer | dense dark liver-brown coat, light beard |
| American Brittany | compact, white with bold orange patches, stub tail |
| French Brittany | smaller, white with darker orange-roan patches, stub tail |
| Deutsch-Drahthaar | wiry dark liver coat with gray ticking, bearded |
| Wirehaired Pointing Griffon | shaggy steel-gray coat with liver patches, big beard and brows |
| Irish Setter | glossy solid mahogany-red, elegant feathered coat |

Extra poses worth a second row later: honoring (standing rigid, staring
sideways), swimming-through-grass "quartering" 3/4 view, curled asleep
(kennel screen).

## Directional sheets (Pokémon-grade movement)

GBA Pokémon characters read as *people in a place* because they face the
way they walk: three art rows — toward camera (down), away (up), side —
with side mirrored for left/right, and only 2–3 frames per row. These
two sheets close that gap for the shipping pair. Generate both as
edit-chains from the existing setter/hunter art so coats and palette
hold. Cell grids are exact — the loaders cut on these numbers.

**Hunter, directional (retires the ×1.45 scale hack)** — one sheet,
**3 columns × 3 rows of 20×28 cells (60×84 total)**, transparent
background. Authored at native size: he displays at ×1.

> Pixel art sprite sheet, GBA overworld character style, 3×3 grid of
> 20×28 cells, transparent background: a bird hunter in blaze-orange cap,
> olive vest, tan brush pants, shotgun carried over his shoulder.
> Row 1 walking TOWARD the camera (facing down-screen): standing, left
> step, right step. Row 2 walking AWAY (back view, cap and vest from
> behind, gun across the back): standing, left step, right step. Row 3
> side view walking: standing, stride extended, stride gathered.
> Consistent 1px dark outline, same palette across all rows. [style block]

**English Setter, directional gait + point** — one sheet, **3 columns ×
2 rows of 32×20 cells (96×40 total)**, transparent. The side-view rows
already ship; this adds the end-on views. The directional POINT is the
money: a dog locked up facing away, tail high toward the camera, is the
shot the whole field view is for.

> Pixel art sprite sheet, 3×2 grid of 32×20 cells, transparent
> background: a small English Setter (white coat, fine blue-black belton
> speckling, feathered tail) seen end-on. Row 1, dog moving AWAY from
> camera: trot frame A (hindquarters and driving rear legs), trot frame
> B (opposite legs), then LOCKED ON POINT seen from behind — body rigid,
> tail straight up and prominent. Row 2, dog moving TOWARD camera: trot
> frame A (chest and reaching forelegs), trot frame B, then LOCKED ON
> POINT head-on — low head, intense stare, one foreleg lifted. The dog
> is narrow in these views (~14px wide), centered per cell. [style block]

Acceptance (30s at @4x): silhouettes read as *away/toward* at a glance
(shoulders + tail vs chest + head); the two trot frames genuinely
alternate legs (no pose-clone with shifted pixels); point poses are
unmistakable without motion; palette matches the shipping side-view
sheets. Two rules learned the hard way (first delivery failed both):
**QA transparency against a DARK background, never white** — the first
hunter sheet shipped each figure on an unkeyed pale backing block,
invisible in the white preview, a glowing box in the field; and **the
figure must FILL the cell** — ≥24px of the hunter's 28px cell height
(first delivery: 15px, forcing an interim ×2 display). Ship as
`art/hunter-dirs.png` and `art/english-setter-dirs.png` — the scenes
select rows by heading once these land.

**REGEN OPEN — hunter-dirs**: re-run the hunter prompt above with:
"Each figure fills the cell: 24–26px tall of the 28px cell height,
feet on the bottom cell edge. Fully transparent background, no backing
tile or frame behind the figure." The shipping sheet is a keyed-out
cleanup of delivery 1 drawn at ×2 as an interim; the regen restores ×1
(delete the setScale(2) in FieldScene's hunter-dirs branch).

## Flush-view birds

Template (each species, two wingbeat frames + one falling frame):

> Pixel art sprite sheet, plain white background: a {SPECIES} in flight,
> side view, roughly 44×28 pixels, three frames in a row: wings up, wings
> down, and shot-folded falling. Gamebird silhouette: chunky round body,
> proportionally small head, SHORT ROUNDED wings (never long or pointed —
> quail and grouse are burst fliers), stubby tail unless noted. Plumage:
> {PLUMAGE}. [style block]

| Species | {PLUMAGE} |
|---|---|
| Rooster pheasant | iridescent green head, red face wattle, white neck ring, coppery barred body, very long pointed barred tail |
| Hen pheasant | plain warm buff-tan all over, mottled, shorter tail |
| Bobwhite | small round bird, russet-brown, white throat and eye-stripe |
| Ruffed grouse | gray-brown mottled, fanned banded tail, black neck ruff |
| Woodcock | plump, russet belly, long straight bill, big dark eye, rounded wings |
| Sharptail | pale buff-white spotted breast, short pointed white-edged tail |
| Hungarian partridge | gray body, rust-orange face, chestnut horseshoe on the belly |
| Chukar | gray-buff body, black band through the eye and down the throat, barred flanks, red bill and legs |
| Prairie chicken | heavily barred brown-and-buff, short rounded dark tail |
| Blue grouse | slate blue-gray, long dark tail with pale gray band |
| California quail | gray-brown, scaled belly, black throat, forward-curling black topknot |
| Gambel's quail | gray with rust cap and cream belly with black patch, curling topknot |
| Scaled quail | pale blue-gray, scaled pattern all over, white "cotton top" crest |
| Montezuma quail | dark round bird, clown-striped black-and-white face, white-spotted flanks |
| Mountain quail | gray-and-chestnut, white-barred flanks, long straight head plume |

Canvas note: the engine scales species size at runtime (quail 0.62 →
pheasant 1.15), so most sheets stay 44×28 — but draw the pheasants on
56×32 so the long tail gets real pixels.

Field-view birds stay tiny (10–13px) — generate one generic "hidden bird"
dot-sprite and a small "downed bird" sprite; species identity lives in the
flush view.

## Regional tilesets (16×16, one prompt per region)

> Pixel art tileset on a 16×16 grid, plain background, seamless: {SET}.
> Calm readable shapes — do not match the busy grass of the field mockup;
> the locked palette carries autumn mood. Cover tiles must be
> unmistakably darker than open ground at a glance (gameplay constraint:
> runners hold at cover edges, singles relight into cover — cover-vs-open
> is mechanical, not just decorative). [style block]

Use the field mockup for **palette and mood only**, not composition or
grass density. Prefer flat, seamless base grass and distinctly darker
cover patches over painterly continuous ground.

- **Southern Plains / Quail Fields**: dry straw grass base, ragweed-brown
  cover patch, mesquite shrub, sandy two-track road edge
- **Prairie Pothole**: golden cut-corn stubble base, dense olive cattail
  slough cover, wild plum thicket, shelterbelt cedar
- **North Woods**: leaf-litter forest floor base, alder thicket cover,
  white-barked aspen, young conifer
- **Great Basin rimrock**: pale sage-and-dust base, basalt rimrock ledge,
  gray-green sagebrush clump, cheatgrass slope
- **Sonoran Desert**: pink-tan desert floor base, thornscrub wash cover,
  saguaro, prickly pear cluster
- **High Rockies timberline**: alpine meadow base, krummholz fir cover,
  granite boulder, huckleberry patch
- **Pacific Valleys**: oat-gold hill grass base, oak-leaf duff cover,
  valley oak with wide crown, gray fence line

Weather overlays: a snow variant of each base tile; puddle/wet-sheen tile
for rain.

## Flush-view backgrounds (480×270, one per region × weather)

> Pixel art game background, 480×270, no characters: low hunter's-eye
> view across {REGION FOREGROUND}, {SKY}, thin horizon detail
> ({HORIZON}). Bottom quarter is ground, the rest open sky — gameplay
> happens in the sky. [style block]

Mix: foregrounds from the tileset list; skies = pale overcast / hard blue
September / snow-gray with flurries / rain streaks; horizons = shelterbelt,
bare aspen line, rimrock rim, saguaro line, oak-studded ridge.

## UI & map

- **US travel map**: > Pixel art map of the continental United States,
  chunky simplified 8-bit coastline, warm tan landmass on deep navy,
  subtle darker-tan mountain ridges, small gold circular pin markers,
  cream monospace labels. [style block]
- **Icons, 12–16px, one sheet**: red shotshell, brass dog bell, orange
  beeper collar, GPS handheld with tiny screen, whistle, paw print, gold
  star pin, snowflake / sun / raindrop / frost condition glyphs, small
  truck.
- **Kennel portraits (optional flourish)**: > Pixel art portrait, 48×48,
  head-and-chest of a {COAT} hunting dog, three-quarter view, plain dark
  olive background — vintage sporting-dog oil portrait rendered in
  16-bit pixels. [style block]
- **Flush-view shotgun, v3 socket** (procedural placeholder in
  `FlushScene.makeShotgun`; pose math in `game/gunAim.ts` — the gun
  SWAYS with the aim and recoils, it never swings like a stick. The
  painted sprite must be authored in PERSPECTIVE, from behind, DOOM
  weapon-sprite style; profile/side views and full-height centered
  barrels are both rejected looks): > Pixel art sprite, 90×130,
  transparent background, single frame: side-by-side double-barrel
  shotgun from the shooter's first-person view, low ready, angled up.
  Strong foreshortening: walnut stock and trigger area LARGE at bottom
  right, twin blued barrels tapering steeply to a small distant muzzle
  with one brass bead top-center-left, engraved brass receiver between,
  simple gloved left hand gripping the forend, mitten-simple. Muzzle =
  smallest element; stock and hand = largest. [style block]
  **Drop-in**: ship as `art/shotgun-fp-v3.png`, add its preload line in
  FlushScene — the scene already prefers the `shotgun-fp-v3` texture
  over the generated placeholder. Muzzle tip must sit at sprite-local
  (40, 2) or adjust `GUN_MUZZLE_OFFSET` so the flash stays on the bead.

## The road to production quality

**Executable plan (phases, gates, AI-only finish path):** see
[`docs/PRODUCTION.md`](PRODUCTION.md). This section is the short form.

Production look = **assets × presentation code**, roughly half each. The
covey-stacking complaint proved the principle: the bobwhite sheet was
fine — the launch choreography was the problem. Track both.

**Constraint:** no human true-pixel / hired artist required. Finish =
generate → cell pack → nearest-neighbor native size → **palette quantize**
→ scripted cleanup → QA checklist → `public/art/`. Human Aseprite is an
optional future if quality plateaus — not a gate.

**Order (do not skip):** Phase 0 foundations (pipeline + field/flush
presentation seams) → Phase 1 vertical slice (setter + SP + hunter +
bobwhite, zero placeholders) → Phase 2 visible dog craft → Phase 3
factory (dogs → regions → birds → meta) → Phase 4 cohesion audit.

**Already shipped (juice):** covey fan/waves, shadows, feathers, weather
FX, shot depth ladder, bitmap font, setter 4-gait + point, SP tiles/plate,
bobwhite sheet, cover edge work, wind-aware cast.

## Integration notes

- Ship sheets as PNG (+ atlas JSON when frame maps stabilize); 1 game px =
  1 asset px (`pixelArt: true`, integer zoom only).
- Register art in scene fallback maps (`DOG_SHEETS`, `BIRD_SHEETS`,
  `FIELD_TILESETS`, `FLUSH_BACKDROPS`); placeholders remain for gaps.
- Keep every asset on the locked palette (quantize script); recolor
  breeds/species by palette swap where silhouettes match.
