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

## The road to production quality

Production look = **assets × presentation code**, roughly half each. The
covey-stacking complaint proved the principle: the bobwhite sheet was
fine — the launch choreography was the problem. Track both.

**Phase 1 — complete the asset set** (current generation pipeline; every
batch ships incrementally behind the fallback maps):
13 remaining bird sheets → 6 remaining backdrop plates (+ snow/rain
variants for the common regions) → 11 dog sheets (the field view's star)
→ hunter walk/sprint sheet → 7 tilesets (the flat/bounded-cover rules) →
title screen, US map plate, icon sheet, kennel portraits.

**Phase 2 — hand-finish to true pixels** (the 80→100): re-pixel each
@mid source in Aseprite on the locked palette — uniform 1px outlines,
kill orphan pixels, verify at 1x — or regenerate finals with a
pixel-native tool using the drafts as reference. The honest production
option: **commission a pixel artist for a consistency pass** — the AI
drafts function as a complete, unambiguous spec, which makes this cheap;
a human unifying outlines and shading across ~40 sheets is what
separates "good AI art" from shipped-game art.

**Phase 3 — presentation code (juice — free, huge)**:
done: covey fan + waves, spread launches, altitude depth-scaling, exit
drive, **bird ground shadows** (shrink/fade with altitude),
**feather-puff bursts** on hits, **weather dressing** (condition tint +
falling snow/rain particles in both views, `scenes/weatherFx.ts`), and a
proper depth ladder in the shot view (birds fly behind timber, under the
weather, beneath the HUD). Next, in impact order: a real **pixel bitmap
font** for all UI (the single biggest production-feel upgrade left);
shell-eject flick; backdrop **parallax** (split plates into
sky/hills/foreground); quick fade/iris scene transitions; field-view
walk cycles once dog sheets land.

**Phase 4 — cohesion audit**: screenshot matrix of every region ×
weather × a flush; fix outliers; final palette-enforcement pass
(index every shipped PNG to the .gpl).

## Integration notes

- Ship sheets as PNG + Phaser atlas JSON; keep 1 game px = 1 asset px
  (integer zoom only, `pixelArt: true` already set).
- Replace `makeTextures()` rectangles scene by scene; tiles draw via
  tilemap or blitter over the current `Graphics` field.
- Keep every asset on the locked palette; recolor breeds/species by
  palette swap where silhouettes match (the two Brittanys, the desert
  quail) to buy consistency for free.
