"""Shared woody kit for the ground kit: northern-prairie brush for Sharptail
and Red Plains brush and trees for Quail, in the house style (bold low-poly
masses, faceted clusters, vertex paint, no textures).

Run headless through the machine lock:
  tools3d/heavy.sh /Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/woody-kit/build.py
Contact sheet of the result (tools3d/assets/woody-kit/gallery.py):
  tools3d/heavy.sh /Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/woody-kit/gallery.py -- out.png

Every species exports three details: high and lite for the near band, and
far, a handful of faces holding the same silhouette and colour mass for the
distance. Assets are authored in metres with their origin at the ground
centre; the runtime normalises them to unit height and scales each plant
to the height the cover map asks for. Each GLB holds a 'wood' and a
'foliage' mesh painted through one vertex-colour material.

Foliage is built as lobes: a dark closed core dressed with leaf cards that
tilt out from its surface. Closed faceted balls alone read as stone in
autumn colours (and as umbrellas when held up on stems); the cards break
the silhouette and the core shows between them as the crown's own depth.
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/models/woody-kit'
SOURCE = ROOT / 'assets/source/woody-kit'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def linear(hexcolor):
    """sRGB hex to the linear floats a FLOAT_COLOR attribute stores."""
    c = [((hexcolor >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c)

material = bpy.data.materials.new('Woody / vertex paint')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .95
paint = material.node_tree.nodes.new('ShaderNodeVertexColor')
paint.layer_name = 'WoodyPaint'
material.node_tree.links.new(paint.outputs['Color'], bsdf.inputs['Base Color'])

class Part:
    """Faces with a colour each, built into one mesh. Foliage parts also
    keep their lobes, from which the far detail is made, and may send their
    lobe cores to a `cores` part of their own: exported as a 'foliage-core'
    mesh, which the runtime shades fully round, as the crown's soft shade."""
    def __init__(self, cores=False):
        self.v, self.f, self.c, self.lobes = [], [], [], []
        self.cores = Part() if cores else None
    def face(self, idx, color):
        self.f.append(tuple(idx)); self.c.append(color)

def shade(color, k):
    return tuple(min(1, x * k) for x in color)

def stem(part, a, b, r0, r1, color, sides=4):
    """Tapered prism from a to b."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < .9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized(); w = axis.cross(u).normalized()
    o = len(part.v)
    for p, r in ((a, r0), (b, r1)):
        for i in range(sides):
            t = i * math.tau / sides
            part.v.append(tuple(p + (u * math.cos(t) + w * math.sin(t)) * r))
    for i in range(sides):
        j = (i + 1) % sides
        part.face((o + i, o + j, o + sides + j, o + sides + i), shade(color, .85 + .15 * (i % 2)))
    part.face(tuple(o + sides + i for i in range(sides)), color)

def blob(part, center, radii, color, rng, sides=6, rings=3, ragged=.18, flat=0.0, light=(.72, 1.08)):
    """A faceted closed cluster: a jittered lat-long ellipsoid whose rim
    breaks up, shaded dark below to lit above (light and shade only; the
    species colour comes from `color`). Lobe cores and far details."""
    cx, cy, cz = center; rx, ry, rz = radii
    # Two rings would make a pointed diamond; a cluster needs a shoulder.
    rings = max(3, rings)
    o = len(part.v)
    top = (cx, cy, cz + rz * (1 - flat * .5))
    bottom = (cx, cy, cz - rz * (1 - flat))
    part.v.append(bottom)
    for ring in range(1, rings):
        phi = -math.pi / 2 + ring * math.pi / rings
        for i in range(sides):
            t = i * math.tau / sides + ring * .4
            k = 1 + (rng.random() - .5) * 2 * ragged + (ragged * .6 if (i + ring) % 2 else 0)
            part.v.append((cx + math.cos(t) * math.cos(phi) * rx * k,
                           cy + math.sin(t) * math.cos(phi) * ry * k,
                           cz + math.sin(phi) * rz * (1 - (flat if phi < 0 else 0)) + (rng.random() - .5) * rz * ragged * .5))
    part.v.append(top)
    last = len(part.v) - 1
    def lit(z):
        t = max(0, min(1, (z - (cz - rz)) / (2 * rz)))
        return shade(color, (light[0] + (light[1] - light[0]) * t) * (.93 + rng.random() * .14))
    for i in range(sides):
        j = (i + 1) % sides
        part.face((o, o + 1 + j, o + 1 + i), lit(cz - rz))
    for ring in range(rings - 2):
        a0, b0 = o + 1 + ring * sides, o + 1 + (ring + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            z = part.v[a0 + i][2]
            part.face((a0 + i, a0 + j, b0 + j, b0 + i), lit(z))
    a0 = o + 1 + (rings - 2) * sides
    for i in range(sides):
        j = (i + 1) % sides
        part.face((a0 + i, a0 + j, last), lit(cz + rz))

GOLDEN = math.pi * (3 - math.sqrt(5))

def lobe(part, center, radii, palette, rng, cards, size, core_sides=5, diamond=True, underside=False, tilt=(.3, .8), core=.62, core_scale=.74):
    """One foliage lobe: a dark core and `cards` leaf cards spread over its
    shell (Fibonacci directions from the top down), each tilted out from
    the surface so its tip breaks the outline. Without `underside` the
    cards stop short of the bottom, leaving the core as the crown's shaded
    underside."""
    cx, cy, cz = center; rx, ry, rz = radii
    part.lobes.append((center, radii, palette[0]))
    if core_sides:
        blob(part.cores or part, center, (rx * core_scale, ry * core_scale, rz * core_scale * .95), shade(palette[0], core), rng, sides=core_sides, rings=3, ragged=.24, light=(.75, 1.0))
    reach_down = 2.0 if underside else 1.6
    for k in range(cards):
        z = 1 - (k + .5) / cards * reach_down
        ring = math.sqrt(max(0, 1 - z * z)); t = k * GOLDEN + rng.random() * .7
        d = Vector((math.cos(t) * ring, math.sin(t) * ring, z))
        reach = .86 + rng.random() * .2
        p = Vector((cx + d.x * rx * reach, cy + d.y * ry * reach, cz + d.z * rz * reach))
        normal = Vector((d.x / rx, d.y / ry, d.z / rz)).normalized()
        ref = Vector((0, 0, 1)) if abs(normal.z) < .95 else Vector((1, 0, 0))
        u = normal.cross(ref).normalized(); w = normal.cross(u).normalized()
        spin = rng.random() * math.tau
        a = u * math.cos(spin) + w * math.sin(spin)
        lift = tilt[0] + rng.random() * (tilt[1] - tilt[0])
        a = (a * math.cos(lift) + normal * math.sin(lift)).normalized()
        b = normal.cross(a).normalized()
        s = size * (.75 + rng.random() * .5)
        color = shade(palette[k % len(palette)], (.84 + .26 * (z + 1) / 2) * (.93 + rng.random() * .14))
        o = len(part.v)
        if diamond:
            part.v.extend([tuple(p - a * s * .35), tuple(p + b * s * .4), tuple(p + a * s), tuple(p - b * s * .4)])
            part.face((o, o + 1, o + 2, o + 3), color)
        else:
            part.v.extend([tuple(p - a * s * .3 + b * s * .4), tuple(p - a * s * .3 - b * s * .4), tuple(p + a * s)])
            part.face((o, o + 1, o + 2), color)

def spray(part, base, tip, width, color):
    """One thin twig or leaf spray: a narrow double triangle."""
    b, t = Vector(base), Vector(tip)
    d = (t - b).normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    o = len(part.v)
    part.v.extend([tuple(b - side * width), tuple(b + side * width), tuple(t)])
    part.face((o, o + 1, o + 2), color)

def berries(part, center, spread, color, rng, n):
    for _ in range(n):
        p = Vector(center) + Vector(((rng.random() - .5) * spread, (rng.random() - .5) * spread, (rng.random() - .5) * spread * .5))
        s = .035
        o = len(part.v)
        part.v.extend([tuple(p + Vector((s, 0, 0))), tuple(p + Vector((-s * .5, s * .87, 0))), tuple(p + Vector((-s * .5, -s * .87, 0))), tuple(p + Vector((0, 0, s * 1.2)))])
        part.face((o, o + 1, o + 3), color); part.face((o + 1, o + 2, o + 3), color); part.face((o + 2, o, o + 3), color)

def crown(leaf, lobes, palette, rng, hi, per_lobe=(16, 10), size=.6, **kw):
    """Lobes as (x, y, z, rx, ry, rz); lite keeps the first ones. Card size
    scales with each lobe; lite cards are single triangles. `core` is the
    core's shade, `lite_size` scales Lite's cards."""
    tilt = kw.get('tilt', (.3, .75))
    for i, (x, y, z, rx, ry, rz) in enumerate(lobes):
        cols = palette[i % len(palette):] + palette[:i % len(palette)]
        # Lite's fewer, single-triangle cards lie closer to the core: tilted
        # as far as High's they read as shards round a bare frame.
        lobe(leaf, (x, y, z), (rx, ry, rz), cols, rng, per_lobe[0] if hi else per_lobe[1],
             size * min(rx, ry, rz * 1.4) * (1 if hi else kw.get('lite_size', 1.15)),
             core_sides=kw.get('core_sides', 5 if hi else 4), diamond=hi, underside=kw.get('underside', False),
             tilt=tilt if hi else (tilt[0] * .5, tilt[1] * .6), core=kw.get('core', .62), core_scale=kw.get('core_scale', .74 if hi else .8))

# ---------------------------------------------------------------------------
# Species. Each returns (wood, foliage) Parts for a detail level.
# ---------------------------------------------------------------------------
BARK_GREY = linear(0x5d554c); BARK_DARK = linear(0x3d342d); BARK_RED = linear(0x6e3b30)

def buckbrush(detail, rng):
    """Western snowberry: a dense knee-high colony of fine purplish stems
    under bronze and dull yellow October leaves, white berries, leafy
    right to the ground. Fine-textured, never a smooth lump."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0x8e5c48), linear(0xa47a4e), linear(0x82504a), linear(0xae8a5a)]
    lobes = [(0, 0, .5, .4, .36, .3), (.42, .14, .4, .34, .3, .26), (-.38, .2, .42, .34, .3, .27), (.06, -.4, .38, .33, .3, .25), (-.2, -.28, .5, .28, .26, .22)]
    crown(leaf, lobes if hi else lobes[:4], palette, rng, hi, per_lobe=(12, 9), size=.55, tilt=(.5, 1.0), underside=True, core_scale=.8)
    for i in range(14 if hi else 7):
        a = rng.random() * math.tau; r = rng.random() * .55
        spray(wood, (math.cos(a) * r, math.sin(a) * r, .05), (math.cos(a) * (r + .12), math.sin(a) * (r + .12), .7 + rng.random() * .22), .018, BARK_RED)
    berries(leaf, (0, 0, .62), .8, linear(0xe8e4dc), rng, 9 if hi else 5)
    return wood, leaf

def chokecherry(detail, rng):
    """A chokecherry clump: several grey stems in a suckering thicket, dark
    maroon October leaves from knee height to the top, so the clump reads
    as brush, not as a crown held up on a pole."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0x6e2a26), linear(0x84362a), linear(0x96482c), linear(0x7a3a30)]
    stems = 6 if hi else 3
    for i in range(stems):
        a = i * math.tau / stems + rng.random() * .5
        top = (math.cos(a) * .45, math.sin(a) * .45, 1.6 + rng.random() * .5)
        stem(wood, (math.cos(a) * .18, math.sin(a) * .18, 0), top, .045, .022, BARK_GREY, 4 if hi else 3)
    lobes = [(0, .05, 1.9, .75, .68, .6), (.45, .2, 1.35, .62, .56, .52), (-.45, .28, 1.4, .62, .56, .5), (.36, -.2, .85, .52, .48, .44),
             (-.38, -.26, .82, .52, .46, .44), (.1, -.45, 1.3, .55, .5, .46), (-.1, .12, 2.3, .5, .46, .4)]
    crown(leaf, lobes if hi else lobes[:5], palette, rng, hi)
    if hi: berries(leaf, (.2, .1, 1.8), 1.0, linear(0x2a1418), rng, 6)
    return wood, leaf

def buffaloberry(detail, rng):
    """Silver buffaloberry: a dense, thorny, rounded thicket of silver-grey
    leaves, scarlet berries in the fall, foliage almost to the ground."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0xa8a28c), linear(0x989a86), linear(0xb4ae96), linear(0x9c9480)]
    for i in range(3 if hi else 2):
        a = i * 2.2
        stem(wood, (math.cos(a) * .1, math.sin(a) * .1, 0), (math.cos(a) * .4, math.sin(a) * .4, 1.0), .05, .025, BARK_DARK, 4 if hi else 3)
    lobes = [(0, 0, 1.45, .8, .74, .6), (.6, .22, .85, .6, .55, .52), (-.55, .25, .9, .6, .55, .52), (.1, -.58, .82, .55, .52, .48),
             (-.1, .18, 1.95, .5, .46, .38), (.42, -.26, 1.65, .46, .42, .36)]
    crown(leaf, lobes if hi else lobes[:4], palette, rng, hi, underside=True)
    if hi: berries(leaf, (0, 0, 1.2), 1.4, linear(0xb8302a), rng, 8)
    return wood, leaf

def wild_rose(detail, rng):
    """Prairie wild rose: a low patch of arching red canes with sparse
    orange-red fall leaves and red hips."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    for i in range(12 if hi else 6):
        a = rng.random() * math.tau; r = rng.random() * .25
        spray(wood, (math.cos(a) * r, math.sin(a) * r, 0), (math.cos(a) * (r + .35), math.sin(a) * (r + .35), .5 + rng.random() * .2), .022, BARK_RED)
    palette = [linear(0xa24e2c), linear(0x8e5a32), linear(0x7e3a2c), linear(0xb0602e)]
    lobes = [(.2, .1, .38, .3, .26, .2), (-.22, .14, .34, .28, .25, .19), (.02, -.24, .36, .28, .25, .2), (-.05, .05, .52, .22, .2, .15)]
    crown(leaf, lobes if hi else lobes[:3], palette, rng, hi, per_lobe=(9, 7), size=.6, tilt=(.5, 1.1), underside=True)
    if hi: berries(leaf, (0, 0, .5), .6, linear(0xc02a22), rng, 6)
    return wood, leaf

BARK_PLUM = linear(0x5e4034); BARK_MESQUITE = linear(0x46382f); BARK_PALE = linear(0x80786c)

def sand_plum(detail, rng):
    """Sand plum: a low, dense, rounded mound of zigzag twigs and autumn
    leaves (rust, orange, maroon, a little dull gold), half again as wide as
    it is tall. Its many thin suckering stems are bare in the bottom fifth,
    where a covey loafs in the shade: open at ground level, closed above."""
    wood, leaf = Part(), Part(cores=True)
    hi = detail == 'high'
    palette = [linear(0xae6a42), linear(0xbe8444), linear(0x9a4c3e), linear(0xb6924a), linear(0xa66c3c)]
    stem_bark = linear(0x76604e)
    for i in range(18 if hi else 9):
        a = i * 2.39996 + rng.random() * .5; r0 = .05 + rng.random() * .7; lean = .2 + rng.random() * .3
        top = (math.cos(a) * (r0 + lean), math.sin(a) * (r0 + lean), .55 + rng.random() * .3)
        stem(wood, (math.cos(a) * r0, math.sin(a) * r0, -.02), top, .022, .011, stem_bark, 3)
    lobes = [(0, 0, 1.2, 1.0, .92, .5),
             (.9, .2, .82, .64, .58, .44), (-.85, .32, .84, .64, .58, .44), (.18, -.9, .8, .62, .56, .42),
             (-.5, -.7, .88, .6, .54, .42), (.5, .78, .9, .58, .52, .42), (.12, .1, 1.5, .62, .56, .3),
             (.72, -.55, 1.08, .52, .48, .38), (-.78, -.2, 1.12, .52, .48, .38)]
    # Many small cards lying close over a big, lit core: a dense mound with
    # a twiggy edge, not a cloud of shards.
    crown(leaf, lobes if hi else lobes[:5], palette, rng, hi, per_lobe=(20, 12), size=.42, tilt=(.2, .55), core_scale=.86, core=.6,
          lite_size=1.0)
    return wood, leaf

def shinnery(detail, rng):
    """Shinnery oak: a knee-to-waist colony of leathery olive and russet
    oak, leafy right down to the sand: a broad, lumpy, low mound."""
    wood, leaf = Part(), Part(cores=True)
    hi = detail == 'high'
    palette = [linear(0x66603a), linear(0x7c5e34), linear(0x6e663a), linear(0x86683a), linear(0x5c5836)]
    n = 8 if hi else 5
    lobes = []
    for i in range(n):
        a = i * 2.39996; r = .1 + (i / n) * 1.0
        lobes.append((math.cos(a) * r, math.sin(a) * r, .4 + rng.random() * .14, .52 + rng.random() * .12, .46, .34 + rng.random() * .08))
    lobes.append((.05, .02, .74, .46, .42, .24))
    crown(leaf, lobes, palette, rng, hi, per_lobe=(10, 6), size=.6, underside=True, tilt=(.35, .85), core_scale=.8)
    for i in range(6 if hi else 3):
        a = rng.random() * math.tau; r = rng.random() * .9
        spray(wood, (math.cos(a) * r, math.sin(a) * r, .3), (math.cos(a) * r * 1.1, math.sin(a) * r * 1.1, .9 + rng.random() * .2), .022, BARK_DARK)
    return wood, leaf

def sand_sage(detail, rng):
    """Sand sagebrush: an airy, rounded clump of fine silver-green sprays on
    a few grey woody stems; the sand shows through its base."""
    wood, leaf = Part(), Part(cores=True)
    hi = detail == 'high'
    palette = [linear(0xa2a88e), linear(0x909a80), linear(0xb0b29a), linear(0x989a7c)]
    for i in range(5 if hi else 3):
        a = i * 1.3 + rng.random() * .4
        stem(wood, (math.cos(a) * .05, math.sin(a) * .05, 0), (math.cos(a) * .3, math.sin(a) * .3, .42), .025, .012, BARK_GREY, 3)
    lobes = [(.14, .06, .62, .34, .3, .26), (-.16, .14, .64, .32, .3, .24), (0, -.18, .58, .32, .3, .24), (.04, .02, .86, .26, .24, .18)]
    crown(leaf, lobes if hi else lobes[:3], palette, rng, hi, per_lobe=(9, 6), size=.55, tilt=(.6, 1.1), core_scale=.6)
    for i in range(16 if hi else 7):
        a = rng.random() * math.tau; r = .2 + rng.random() * .3
        spray(leaf, (math.cos(a) * r * .4, math.sin(a) * r * .4, .35), (math.cos(a) * (r + .25), math.sin(a) * (r + .25), .72 + rng.random() * .3), .035, palette[i % 4])
    return wood, leaf

def tree(detail, rng, height, trunk_r, limbs, lobes, palette, bark, fine=False):
    wood, leaf = Part(), Part(cores=True)
    hi = detail == 'high'
    # The far detail redraws the trunk and main limbs from these.
    wood.limbs, wood.bark = [], bark
    for (a0, a1, r0, r1) in limbs:
        stem(wood, a0, a1, r0 * trunk_r, r1 * trunk_r, bark, 5 if hi else 4)
        wood.limbs.append((a0, a1, r0 * trunk_r, r1 * trunk_r))
    keep = lobes if hi else lobes[:max(3, len(lobes) * 2 // 3)]
    # A fine crown (mesquite) is many small flat-lying cards; a broadleaf
    # crown fewer, bigger ones.
    # Leaves are small beside any crown: big cards on a big tree read as
    # shards.
    crown(leaf, keep, palette, rng, hi, per_lobe=(16, 9) if fine else (22, 13), size=.26 if fine else .3,
          tilt=(.25, .7) if fine else (.3, .8), core_sides=5 if fine else (6 if hi else 5), core_scale=.86 if fine else .8,
          lite_size=1.0)
    return wood, leaf

def mesquite(detail, rng):
    """Honey mesquite: low and spreading. Four or five dark trunks lean out
    from the ground and fork, one limb rising, one reaching out; the crown
    is one fine, open, grey-green dome of feathery leaves that droops to
    knee height at its edges, wider than it is tall. Never a crown held up
    on one pole, never flat layers on stalks."""
    hi = detail == 'high'
    n = 5 if hi else 4
    trunks, branches, lobes = [], [], []
    for i in range(n):
        a = i * math.tau / n + rng.random() * .6
        lean = .45 + rng.random() * .3; length = 1.3 + rng.random() * .4
        base = (math.cos(a) * .12, math.sin(a) * .12, 0)
        reach = .12 + math.sin(lean) * length
        mid = (math.cos(a) * reach, math.sin(a) * reach, math.cos(lean) * length)
        up = (mid[0] * .8, mid[1] * .8, mid[2] + 1.1 + rng.random() * .3)
        out = (mid[0] * 1.5, mid[1] * 1.5, mid[2] + .1)
        # Trunks first: the far detail keeps them.
        trunks.append((base, mid, 1, .7)); branches += [(mid, up, .65, .35), (mid, out, .55, .3)]
        # The dome over the rising limb, and the skirt drooping from the reach.
        lobes.append((up[0], up[1], up[2] - .05, 1.2, 1.1, .8))
        lobes.append((out[0] * 1.05, out[1] * 1.05, out[2] - .35, 1.0, .9, .7))
    lobes.insert(0, (0, 0, 2.7, 1.8, 1.6, .95))
    palette = [linear(0x8a9670), linear(0x98a07a), linear(0xa6a87a), linear(0x7e8a68)]
    return tree(detail, rng, 3.6, .16, trunks + branches, lobes, palette, BARK_MESQUITE, fine=True)

def hackberry(detail, rng):
    """Hackberry: a short, stout grey trunk forking low into a few spreading
    limbs under a broad, rounded, ragged crown that comes down to a third of
    the tree's height and is going yellow."""
    limbs = [((0, 0, 0), (.1, 0, 2.3), 1, .8), ((.1, 0, 2.0), (2.2, .6, 4.6), .6, .3), ((.1, 0, 2.1), (-2.0, 1.0, 4.8), .6, .3),
             ((.1, 0, 2.2), (.4, -2.2, 5.0), .55, .3), ((.1, 0, 2.3), (-.3, -.2, 6.4), .5, .28)]
    lobes = [(0, 0, 5.6, 2.9, 2.7, 2.0), (2.7, .6, 4.3, 1.8, 1.6, 1.4), (-2.6, 1.1, 4.4, 1.8, 1.6, 1.4), (.5, -2.6, 4.5, 1.7, 1.6, 1.35),
             (-1.4, -1.8, 4.9, 1.5, 1.4, 1.2), (.3, .3, 7.3, 1.9, 1.8, 1.2)]
    palette = [linear(0x9c9248), linear(0x8c8a46), linear(0xaa9c4e), linear(0x84803e)]
    return tree(detail, rng, 8.5, .3, limbs, lobes, palette, BARK_PALE)

def elm(detail, rng):
    """American elm: a trunk forking at a quarter of its height into a vase
    of rising limbs, under a broad, arching yellow crown whose edges droop."""
    limbs = [((0, 0, 0), (0, 0, 2.8), 1, .78), ((0, 0, 2.6), (2.6, .5, 7.2), .6, .32), ((0, 0, 2.6), (-2.4, 1.1, 7.4), .6, .32),
             ((0, 0, 2.7), (.5, -2.6, 7.6), .55, .3), ((0, 0, 2.8), (-.6, -.4, 8.4), .5, .28)]
    lobes = [(0, 0, 8.8, 3.8, 3.6, 1.8), (3.2, .6, 7.0, 2.2, 2.0, 1.6), (-3.0, 1.2, 7.1, 2.2, 2.0, 1.6), (.6, -3.2, 7.2, 2.1, 2.0, 1.5),
             (4.4, -.6, 5.6, 1.4, 1.3, 1.2), (-.2, .3, 10.2, 2.2, 2.0, 1.0)]
    palette = [linear(0xa8964a), linear(0x9a8c48), linear(0xb4a050), linear(0x8e8842)]
    return tree(detail, rng, 11, .36, limbs, lobes, palette, BARK_GREY)

def cottonwood(detail, rng):
    """Plains cottonwood: a massive, pale, furrowed trunk, leaning a little,
    forking into a few huge limbs under an enormous, irregular, open crown
    gone gold; the creek's landmark."""
    limbs = [((0, 0, 0), (.4, 0, 4.2), 1, .75), ((.4, 0, 3.8), (3.6, .8, 9.0), .62, .34), ((.4, 0, 4.0), (-2.8, 1.6, 9.6), .6, .34),
             ((.4, 0, 4.1), (1.0, -3.2, 10.0), .55, .32), ((.4, 0, 4.2), (.2, .4, 12.0), .5, .3)]
    lobes = [(.2, 0, 11.6, 4.6, 4.2, 3.0), (4.0, .9, 9.4, 3.0, 2.7, 2.4), (-3.4, 1.8, 9.9, 3.0, 2.7, 2.3), (1.2, -3.8, 10.2, 2.8, 2.6, 2.2),
             (-.6, -.4, 14.0, 2.8, 2.6, 1.7), (5.2, -.8, 7.4, 1.8, 1.6, 1.4)]
    palette = [linear(0xc0a040), linear(0xb09038), linear(0xcaa848), linear(0xa08a3a)]
    return tree(detail, rng, 15.5, .6, limbs, lobes, palette, BARK_PALE)

SPECIES = {
    'buckbrush': (buckbrush, .85), 'chokecherry': (chokecherry, 2.7), 'buffaloberry': (buffaloberry, 2.3), 'wild-rose': (wild_rose, .7),
    'sand-plum': (sand_plum, 1.8), 'shinnery': (shinnery, 1.0), 'sand-sage': (sand_sage, 1.05),
    'mesquite': (mesquite, 3.6), 'hackberry': (hackberry, 8.5), 'elm': (elm, 11.0), 'cottonwood': (cottonwood, 15.5),
}

def far_version(wood, leaf, nominal):
    """The distance version: the lobes merged into one closed mass for a
    low shrub, two (base and top) for a thicket and three for a tree, plus
    one trunk prism where a trunk shows; it keeps the silhouette and the
    colour mass in a few dozen faces."""
    fwood, fleaf = Part(), Part()
    rng = random.Random(7)
    lobes = sorted(leaf.lobes, key=lambda l: l[0][2])
    groups = [lobes] if nominal < 1.2 else [lobes[:len(lobes) // 2], lobes[len(lobes) // 2:]] if nominal < 4 else \
        [[l for l in lobes[:-2] if l[0][0] < 0], [l for l in lobes[:-2] if l[0][0] >= 0], lobes[-2:]]
    avg = tuple(sum(l[2][k] for l in lobes) / len(lobes) for k in range(3)) if lobes else (.5, .5, .5)
    for group in (g for g in groups if g):
        lo = [min(c[k] - r[k] for c, r, _ in group) for k in range(3)]
        hi = [max(c[k] + r[k] for c, r, _ in group) for k in range(3)]
        # The groups overlap in height so a thicket's two masses read as one.
        centre = tuple((lo[k] + hi[k]) / 2 for k in range(3)); radii = tuple((hi[k] - lo[k]) / 2 * (.95 if k < 2 else 1.15) for k in range(3))
        blob(fleaf, centre, radii, shade(avg, .92), rng, sides=6, rings=3, ragged=.2, light=(.72, 1.0))
    if wood.v and max(p[2] for p in wood.v) > 1.5 and lobes:
        base = min(c[2] - r[2] for c, r, _ in lobes)
        if base > .5:
            top = max(p[2] for p in wood.v)
            stem(fwood, (0, 0, 0), (0, 0, base + .4), .025 * top + .05, .012 * top + .03, BARK_GREY, 3)
    return fwood, fleaf

def lobe_colour(lobes):
    return tuple(sum(l[2][k] for l in lobes) / len(lobes) for k in range(3)) if lobes else (.5, .5, .5)

def far_mound(wood, leaf, nominal, open_base=False, tone=.9):
    """A Red Plains thicket's distance version: one closed, rounded mass over
    all its foliage, rooted in the ground. Where the near detail is open at
    the base, the mass's underside falls into deep shade instead: stilts at
    a distance read as a table."""
    fwood, fleaf = Part(), Part()
    rng = random.Random(7)
    lobes = leaf.lobes
    lo = [min(c[k] - r[k] for c, r, _ in lobes) for k in range(3)]
    hi = [max(c[k] + r[k] for c, r, _ in lobes) for k in range(3)]
    # A flattened underside (blob's `flat`) set just into the ground and a
    # rounded top at the foliage's height.
    flat, top, sink = .35, hi[2] * 1.02, .03
    rz = (top + sink) / (2 - flat * 1.5)
    centre = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, rz * (1 - flat) - sink)
    radii = ((hi[0] - lo[0]) / 2 * .9, (hi[1] - lo[1]) / 2 * .9, rz)
    blob(fleaf, centre, radii, shade(lobe_colour(lobes), tone), rng, sides=7, rings=3, ragged=.14, flat=flat,
         light=(.38, 1.0) if open_base else (.62, 1.0))
    return fwood, fleaf

def far_mesquite(wood, leaf, nominal):
    """Mesquite's distance version: one low dome over all its foliage, from
    the drooping skirt to the top, with two skirts breaking its outline and
    the trunks' feet beneath: a broad, low tree, never a lid on stalks."""
    fwood, fleaf = Part(), Part()
    rng = random.Random(7)
    lobes = leaf.lobes
    lo = [min(c[k] - r[k] for c, r, _ in lobes) for k in range(3)]
    hi = [max(c[k] + r[k] for c, r, _ in lobes) for k in range(3)]
    colour = shade(lobe_colour(lobes), .9)
    # The dome comes down nearly as low as the skirts: at a distance a
    # mesquite is a broad, low mass, its trunks only a dark foot beneath.
    bottom = lo[2] + (hi[2] - lo[2]) * .06
    blob(fleaf, ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (bottom + hi[2]) / 2), ((hi[0] - lo[0]) / 2 * .82, (hi[1] - lo[1]) / 2 * .82, (hi[2] - bottom) / 2),
         colour, rng, sides=6, rings=3, ragged=.2, flat=.3, light=(.6, 1.0))
    for (c, r, col) in lobes[2:6:2]:
        blob(fleaf, c, (r[0] * .9, r[1] * .9, r[2] * .9), shade(col, .88), rng, sides=5, rings=3, ragged=.22, light=(.6, 1.0))
    for part in wood.limbs[:2]:
        a, b, r0, r1 = part
        stem(fwood, a, (a[0] + (b[0] - a[0]) * .6, a[1] + (b[1] - a[1]) * .6, a[2] + (b[2] - a[2]) * .6), r0, r1, wood.bark, 3)
    return fwood, fleaf

def far_tree(wood, leaf, nominal, limbs=2, masses=3, pick=None):
    """A Red Plains tree's distance version: its trunk and main limbs as
    prisms, and its biggest lobes (or the ones `pick` names) each as one
    ragged mass, so the crown keeps its own low, broad, uneven outline at a
    distance instead of becoming one ball on a pole."""
    fwood, fleaf = Part(), Part()
    rng = random.Random(7)
    lobes = [leaf.lobes[i] for i in pick if i < len(leaf.lobes)] if pick else \
        sorted(leaf.lobes, key=lambda l: -(l[1][0] * l[1][1] * l[1][2]))[:masses]
    for (c, r, colour) in lobes:
        blob(fleaf, c, (r[0] * .94, r[1] * .94, r[2] * .96), shade(colour, .92), rng, sides=5, rings=3, ragged=.22, light=(.68, 1.0))
    for part in wood.limbs[:limbs]:
        a, b, r0, r1 = part
        stem(fwood, a, b, r0, r1, wood.bark, 3)
    return fwood, fleaf

FAR = {
    # From afar a covey's plum is a dark, warm mass, never orange pebbles.
    'sand-plum': lambda w, l, n: far_mound(w, l, n, open_base=True, tone=.7),
    'shinnery': lambda w, l, n: far_mound(w, l, n),
    'sand-sage': lambda w, l, n: far_mound(w, l, n, open_base=True),
    'mesquite': far_mesquite,
    'hackberry': far_tree, 'elm': far_tree, 'cottonwood': far_tree,
}

def build(name, part, label):
    data = bpy.data.meshes.new(label)
    data.from_pydata(part.v, [], part.f)
    data.update()
    # Closed clusters and stems face outward, whatever order they were
    # authored in; the runtime lights foliage from these windings.
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data); bm.free()
    attr = data.color_attributes.new(name='WoodyPaint', type='FLOAT_COLOR', domain='CORNER')
    for face, color in zip(data.polygons, part.c):
        face.use_smooth = False
        for index in face.loop_indices:
            attr.data[index].color = (*color, 1)
    obj = bpy.data.objects.new(label, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

report = []
gallery = 0
for name, (make, nominal) in SPECIES.items():
    for detail in ('high', 'lite', 'far'):
        seed = sum(ord(ch) for ch in name) * 31
        if detail == 'far':
            wood, leaf = FAR.get(name, far_version)(*make('lite', random.Random(seed)), nominal)
        else:
            wood, leaf = make(detail, random.Random(seed))
        root = bpy.data.objects.new(f'{name}-{detail}', None)
        bpy.context.collection.objects.link(root)
        parts = []
        # Far details of the Red Plains species are all soft mass.
        parts_of = [(wood, 'wood'), (leaf, 'foliage-core' if detail == 'far' and name in FAR else 'foliage')]
        if leaf.cores: parts_of.append((leaf.cores, 'foliage-core'))
        for part, kind in parts_of:
            if not part.f: continue
            obj = build(name, part, f'{name}-{detail} / {kind}')
            obj.parent = root; parts.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        root.select_set(True)
        for obj in parts: obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        path = OUT / f'{name}-{detail}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path), use_selection=True, export_format='GLB', export_yup=True, export_materials='EXPORT')
        tris = 0
        top = 0
        for obj in parts:
            obj.data.calc_loop_triangles(); tris += len(obj.data.loop_triangles)
            top = max(top, max(v.co.z for v in obj.data.vertices))
        report.append({'id': f'{name}-{detail}', 'species': name, 'detail': detail, 'triangles': tris, 'height': round(top, 3),
                       'nominalHeight': nominal, 'bytes': path.stat().st_size})
        root.location = ((gallery % 9) * 6, (gallery // 9) * 8, 0)
        gallery += 1

bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'woody-kit.blend'))
(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'units': 'metres', 'source': 'assets/source/woody-kit/woody-kit.blend',
    'generator': 'tools3d/assets/woody-kit/build.py', 'assets': report}, indent=2))
print(json.dumps([(r['id'], r['triangles']) for r in report]))
