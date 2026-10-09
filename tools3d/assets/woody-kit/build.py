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
    keep their lobes, from which the far detail is made."""
    def __init__(self):
        self.v, self.f, self.c, self.lobes = [], [], [], []
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
        blob(part, center, (rx * core_scale, ry * core_scale, rz * core_scale * .95), shade(palette[0], core), rng, sides=core_sides, rings=3, ragged=.24, light=(.75, 1.0))
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
    scales with each lobe; lite cards are single triangles."""
    tilt = kw.get('tilt', (.3, .75))
    for i, (x, y, z, rx, ry, rz) in enumerate(lobes):
        cols = palette[i % len(palette):] + palette[:i % len(palette)]
        # Lite's fewer, single-triangle cards lie closer to the core: tilted
        # as far as High's they read as shards round a bare frame.
        lobe(leaf, (x, y, z), (rx, ry, rz), cols, rng, per_lobe[0] if hi else per_lobe[1], size * min(rx, ry, rz * 1.4) * (1 if hi else 1.15),
             core_sides=kw.get('core_sides', 5 if hi else 4), diamond=hi, underside=kw.get('underside', False),
             tilt=tilt if hi else (tilt[0] * .5, tilt[1] * .6), core_scale=kw.get('core_scale', .74 if hi else .8))

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

def sand_plum(detail, rng):
    """Sand plum thicket: dense, flat-topped crown over a skirt of bare
    stems, open at ground level where a covey loafs."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0x6a5a2c), linear(0x7a5530), linear(0x5e5a30), linear(0x86602e)]
    for i in range(9 if hi else 5):
        a = i * 2.39996 + rng.random() * .3; r = .15 + (i % 3) * .35
        top = (math.cos(a) * (r + .25), math.sin(a) * (r + .25), .9 + rng.random() * .25)
        stem(wood, (math.cos(a) * r, math.sin(a) * r, 0), top, .035, .02, BARK_DARK, 3)
    lobes = [(0, 0, 1.3, .9, .8, .34), (.75, .3, 1.2, .6, .55, .3), (-.7, .25, 1.22, .6, .55, .3), (.15, -.75, 1.15, .6, .55, .28),
             (-.3, .6, 1.42, .55, .5, .26), (.45, -.3, 1.5, .45, .45, .22)]
    crown(leaf, lobes if hi else lobes[:4], palette, rng, hi, size=.75, tilt=(.15, .55))
    return wood, leaf

def shinnery(detail, rng):
    """Shinnery oak motte: a knee-to-waist colony of leathery dark olive
    and russet oak, a broad lumpy mound."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0x4e4a2c), linear(0x6a4e2c), linear(0x5a522e), linear(0x74562e)]
    n = 8 if hi else 5
    lobes = []
    for i in range(n):
        a = i * 2.39996; r = .15 + (i / n) * 1.0
        lobes.append((math.cos(a) * r, math.sin(a) * r, .42 + rng.random() * .15, .5 + rng.random() * .15, .45, .32 + rng.random() * .1))
    crown(leaf, lobes, palette, rng, hi, per_lobe=(11, 7), size=.6, underside=True)
    for i in range(6 if hi else 3):
        a = rng.random() * math.tau; r = rng.random() * 1.0
        spray(wood, (math.cos(a) * r, math.sin(a) * r, .2), (math.cos(a) * r * 1.1, math.sin(a) * r * 1.1, .85 + rng.random() * .25), .025, BARK_DARK)
    return wood, leaf

def sand_sage(detail, rng):
    """Sand sagebrush: an airy, feathery silver-green shrub of fine sprays
    rising from a few woody stems."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    palette = [linear(0x9aa38c), linear(0x8c967e), linear(0xa6ab94)]
    for i in range(4 if hi else 2):
        a = i * 1.6
        stem(wood, (0, 0, 0), (math.cos(a) * .25, math.sin(a) * .25, .45), .03, .015, BARK_GREY, 3)
    lobes = [(.12, .05, .6, .3, .28, .24), (-.15, .12, .62, .28, .26, .22), (0, -.16, .56, .28, .26, .22), (.05, .02, .8, .22, .2, .16)]
    crown(leaf, lobes if hi else lobes[:3], palette, rng, hi, per_lobe=(8, 6), size=.6, tilt=(.6, 1.1))
    for i in range(14 if hi else 6):
        a = rng.random() * math.tau; r = .25 + rng.random() * .3
        spray(leaf, (math.cos(a) * r * .5, math.sin(a) * r * .5, .45), (math.cos(a) * (r + .2), math.sin(a) * (r + .2), .75 + rng.random() * .25), .05, palette[i % 3])
    return wood, leaf

def tree(detail, rng, height, trunk_r, limbs, lobes, palette, bark, fine=False):
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    for (a0, a1, r0, r1) in limbs:
        stem(wood, a0, a1, r0 * trunk_r, r1 * trunk_r, bark, 5 if hi else 4)
    keep = lobes if hi else lobes[:max(3, len(lobes) * 2 // 3)]
    # A fine crown (mesquite) is many small flat-lying cards; a broadleaf
    # crown fewer, bigger ones.
    crown(leaf, keep, palette, rng, hi, per_lobe=(20, 12) if fine else (16, 10), size=.45 if fine else .6,
          tilt=(.1, .45) if fine else (.3, .8), core_sides=6 if hi else 5)
    return wood, leaf

def mesquite(detail, rng):
    """Honey mesquite: low and spreading, several leaning trunks, a fine
    open grey-green crown in flat layers. Never an umbrella on one pole."""
    limbs = [((0, 0, 0), (1.2, .3, 1.9), 1, .55), ((0, 0, 0), (-1.0, .6, 1.7), .9, .5), ((0, 0, 0), (.2, -1.1, 1.8), .85, .5),
             ((1.2, .3, 1.9), (2.0, .2, 2.7), .5, .3), ((-1.0, .6, 1.7), (-1.9, 1.0, 2.4), .45, .28), ((.2, -1.1, 1.8), (.4, -2.0, 2.5), .45, .28),
             ((.6, .1, 1.2), (.1, .3, 2.9), .5, .3)]
    lobes = [(1.7, .3, 2.9, 1.1, .9, .38), (-1.6, .9, 2.7, 1.0, .9, .36), (.4, -1.8, 2.75, 1.0, .85, .34), (0, .2, 3.25, 1.2, 1.1, .4),
             (1.0, -.9, 3.1, .8, .7, .3), (-.8, -.6, 3.0, .85, .75, .3), (.6, 1.4, 3.05, .8, .7, .3)]
    palette = [linear(0x7d8566), linear(0x6f7a5c), linear(0x88896c)]
    return tree(detail, rng, 4, .16, limbs, lobes, palette, BARK_DARK, fine=True)

def hackberry(detail, rng):
    """Hackberry: one stout grey trunk and a rounded crown going yellow."""
    limbs = [((0, 0, 0), (0, 0, 3.0), 1, .7), ((0, 0, 2.6), (1.4, .4, 5.0), .55, .3), ((0, 0, 2.7), (-1.2, .6, 5.2), .55, .3), ((0, 0, 2.8), (.2, -1.3, 5.4), .5, .3)]
    lobes = [(0, 0, 6.0, 2.6, 2.4, 2.0), (1.6, .5, 5.2, 1.6, 1.4, 1.3), (-1.5, .6, 5.3, 1.6, 1.4, 1.3), (.2, -1.6, 5.4, 1.5, 1.4, 1.3), (0, .3, 7.4, 1.6, 1.5, 1.0)]
    palette = [linear(0x8a8a40), linear(0x7a7a3c), linear(0x969046)]
    return tree(detail, rng, 8, .26, limbs, lobes, palette, BARK_GREY)

def elm(detail, rng):
    """American elm: a trunk forking low into a vase of rising limbs under
    a broad, arching yellow crown."""
    limbs = [((0, 0, 0), (0, 0, 3.2), 1, .75), ((0, 0, 3.0), (2.0, .4, 7.5), .6, .35), ((0, 0, 3.0), (-1.8, .8, 7.6), .6, .35), ((0, 0, 3.1), (.3, -2.0, 7.8), .55, .32)]
    lobes = [(0, 0, 9.0, 3.4, 3.2, 1.8), (2.4, .5, 8.0, 2.0, 1.8, 1.4), (-2.2, .9, 8.1, 2.0, 1.8, 1.4), (.4, -2.4, 8.2, 1.9, 1.8, 1.4), (0, .4, 10.2, 2.2, 2.0, 1.0)]
    palette = [linear(0xa08a3c), linear(0x928240), linear(0xa89444)]
    return tree(detail, rng, 10.5, .32, limbs, lobes, palette, BARK_GREY)

def cottonwood(detail, rng):
    """Plains cottonwood: a massive furrowed trunk and a huge, irregular
    crown of golden October leaves along the creek."""
    limbs = [((0, 0, 0), (0, 0, 4.5), 1, .7), ((0, 0, 4.0), (3.0, .6, 9.0), .6, .35), ((0, 0, 4.2), (-2.6, 1.2, 9.5), .6, .35), ((0, 0, 4.4), (.6, -3.0, 10.0), .55, .32), ((0, 0, 4.5), (.2, .4, 11.5), .5, .3)]
    lobes = [(0, 0, 12.0, 4.4, 4.0, 3.0), (3.4, .8, 10.0, 2.8, 2.5, 2.2), (-3.0, 1.4, 10.4, 2.8, 2.5, 2.2), (.8, -3.4, 10.6, 2.6, 2.5, 2.1), (-.6, -.4, 14.0, 2.6, 2.4, 1.6), (2.0, 2.2, 12.6, 2.0, 1.8, 1.5)]
    palette = [linear(0xb89a3a), linear(0xa88c38), linear(0xc4a444)]
    return tree(detail, rng, 15, .5, limbs, lobes, palette, BARK_GREY)

SPECIES = {
    'buckbrush': (buckbrush, .85), 'chokecherry': (chokecherry, 2.7), 'buffaloberry': (buffaloberry, 2.3), 'wild-rose': (wild_rose, .7),
    'sand-plum': (sand_plum, 1.75), 'shinnery': (shinnery, 1.0), 'sand-sage': (sand_sage, 1.0),
    'mesquite': (mesquite, 3.6), 'hackberry': (hackberry, 8.4), 'elm': (elm, 10.8), 'cottonwood': (cottonwood, 15.0),
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
            wood, leaf = far_version(*make('lite', random.Random(seed)), nominal)
        else:
            wood, leaf = make(detail, random.Random(seed))
        root = bpy.data.objects.new(f'{name}-{detail}', None)
        bpy.context.collection.objects.link(root)
        parts = []
        for part, kind in ((wood, 'wood'), (leaf, 'foliage')):
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
