"""Shared woody kit for the ground kit: northern-prairie brush for Sharptail
and Red Plains brush and trees for Quail, in the house style (bold low-poly
masses, faceted clusters, vertex paint, no textures).

Run headless through the machine lock:
  tools3d/heavy.sh /Applications/Blender.app/Contents/MacOS/Blender --background --python tools3d/assets/woody-kit/build.py

Every species exports three details: high and lite for the near band, and
far, a handful of faces holding the same silhouette and colour mass for the
distance. Assets are authored in metres with their origin at the ground
centre; the runtime normalises them to unit height and scales each plant
to the height the cover map asks for. Each GLB holds a 'wood' and a
'foliage' mesh painted through one vertex-colour material.
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
    """Faces with a colour each, built into one mesh."""
    def __init__(self):
        self.v, self.f, self.c = [], [], []
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
    """A faceted foliage cluster: a jittered lat-long ellipsoid whose rim
    breaks up, shaded dark below to lit above (light and shade only; the
    species colour comes from `color`)."""
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

# ---------------------------------------------------------------------------
# Species. Each returns (wood, foliage) Parts for a detail level.
# ---------------------------------------------------------------------------
BARK_GREY = linear(0x5d554c); BARK_DARK = linear(0x3d342d); BARK_RED = linear(0x6e3b30)

def buckbrush(detail, rng):
    """Western snowberry: a dense knee-to-waist colony of fine purplish
    stems, rusty leaves and white berries, dense right to the ground."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0x7e5a50), linear(0x86624f), linear(0x735a54)]
    n = 9 if hi else 5
    for i in range(n):
        a = i * 2.39996; r = .2 + (i / n) * .6
        blob(leaf, (math.cos(a) * r, math.sin(a) * r * .8, .32 + rng.random() * .2), (.34 + rng.random() * .12, .3, .3 + rng.random() * .12),
             cols[i % 3], rng, sides=6 if hi else 5, rings=3 if hi else 2, flat=.25, ragged=.24)
    for i in range(10 if hi else 4):
        a = rng.random() * math.tau; r = rng.random() * .6
        spray(wood, (math.cos(a) * r, math.sin(a) * r, .2), (math.cos(a) * (r + .15), math.sin(a) * (r + .15), .62 + rng.random() * .25), .02, BARK_RED)
    if hi: berries(leaf, (0, 0, .55), .9, linear(0xe8e4dc), rng, 7)
    return wood, leaf

def chokecherry(detail, rng):
    """A chokecherry clump: grey multi-stems rising to a crown of dark
    maroon October leaves, with a suckering skirt below."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0x5e2a2a), linear(0x6f322c), linear(0x7a4a2c)]
    stems = 5 if hi else 3
    for i in range(stems):
        a = i * math.tau / stems + rng.random() * .5
        top = (math.cos(a) * .5, math.sin(a) * .5, 1.5 + rng.random() * .4)
        stem(wood, (math.cos(a) * .12, math.sin(a) * .12, 0), top, .05, .025, BARK_GREY, 4 if hi else 3)
    crown = [(0, 0, 2.05, .75, .7, .5), (.55, .2, 1.75, .55, .5, .42), (-.5, .3, 1.8, .55, .5, .42), (.1, -.55, 1.7, .5, .5, .4), (-.15, .1, 2.45, .5, .45, .35), (.35, .45, 2.2, .4, .4, .3)]
    for i, (x, y, z, rx, ry, rz) in enumerate(crown if hi else crown[:4]):
        blob(leaf, (x, y, z), (rx, ry, rz), cols[i % 3], rng, sides=6 if hi else 5, rings=3 if hi else 2)
    for i in range(3 if hi else 2):
        a = i * 2.1 + .4
        blob(leaf, (math.cos(a) * .55, math.sin(a) * .5, .45), (.4, .35, .38), cols[(i + 1) % 3], rng, sides=5, rings=2, flat=.4)
    if hi: berries(leaf, (.2, .1, 1.9), 1.0, linear(0x2a1418), rng, 6)
    return wood, leaf

def buffaloberry(detail, rng):
    """Silver buffaloberry: a dense, thorny, rounded thicket of silver-grey
    leaves, scarlet berries in the fall, foliage almost to the ground."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0xa8a08a), linear(0xb0a892), linear(0x989480)]
    for i in range(3 if hi else 2):
        a = i * 2.2
        stem(wood, (math.cos(a) * .1, math.sin(a) * .1, 0), (math.cos(a) * .4, math.sin(a) * .4, 1.1), .05, .025, BARK_DARK, 4 if hi else 3)
    crown = [(0, 0, 1.25, .9, .8, .75), (.6, .25, .8, .6, .55, .55), (-.55, .2, .85, .6, .55, .55), (.1, -.6, .9, .55, .55, .5), (-.1, .2, 1.85, .55, .5, .4), (.4, -.25, 1.55, .5, .45, .4)]
    for i, (x, y, z, rx, ry, rz) in enumerate(crown if hi else crown[:4]):
        blob(leaf, (x, y, z), (rx, ry, rz), cols[i % 3], rng, sides=6 if hi else 5, rings=3 if hi else 2, ragged=.22)
    if hi: berries(leaf, (0, 0, 1.3), 1.4, linear(0xb8302a), rng, 8)
    return wood, leaf

def wild_rose(detail, rng):
    """Prairie wild rose: a low patch of arching red canes with sparse
    orange-red fall leaves and red hips."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    for i in range(10 if hi else 5):
        a = rng.random() * math.tau; r = rng.random() * .25
        spray(wood, (math.cos(a) * r, math.sin(a) * r, 0), (math.cos(a) * (r + .35), math.sin(a) * (r + .35), .5 + rng.random() * .2), .025, BARK_RED)
    cols = [linear(0x9a4a2c), linear(0x8a5a30), linear(0x7a3a2a)]
    for i in range(4 if hi else 2):
        a = i * 1.7
        blob(leaf, (math.cos(a) * .28, math.sin(a) * .25, .35), (.3, .26, .18), cols[i % 3], rng, sides=5, rings=2, ragged=.3)
    if hi: berries(leaf, (0, 0, .5), .6, linear(0xc02a22), rng, 6)
    return wood, leaf

def sand_plum(detail, rng):
    """Sand plum thicket: dense, flat-topped crown over a skirt of bare
    stems, open at ground level where a covey loafs."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0x6a5a2c), linear(0x7a5530), linear(0x5e5a30)]
    for i in range(9 if hi else 5):
        a = i * 2.39996 + rng.random() * .3; r = .15 + (i % 3) * .35
        top = (math.cos(a) * (r + .25), math.sin(a) * (r + .25), .75 + rng.random() * .25)
        stem(wood, (math.cos(a) * r, math.sin(a) * r, 0), top, .035, .02, BARK_DARK, 3)
    crown = [(0, 0, 1.25, .9, .8, .38), (.75, .3, 1.15, .6, .55, .32), (-.7, .25, 1.18, .6, .55, .32), (.15, -.75, 1.1, .6, .55, .3), (-.3, .6, 1.4, .55, .5, .28), (.45, -.3, 1.5, .45, .45, .25)]
    for i, (x, y, z, rx, ry, rz) in enumerate(crown if hi else crown[:4]):
        blob(leaf, (x, y, z), (rx, ry, rz), cols[i % 3], rng, sides=7 if hi else 5, rings=3 if hi else 2, flat=.5, ragged=.2)
    return wood, leaf

def shinnery(detail, rng):
    """Shinnery oak motte: a knee-to-waist colony of leathery dark olive
    and russet oak, a broad lumpy mound."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0x4e4a2c), linear(0x6a4e2c), linear(0x5a522e)]
    n = 9 if hi else 5
    for i in range(n):
        a = i * 2.39996; r = .2 + (i / n) * 1.0
        blob(leaf, (math.cos(a) * r, math.sin(a) * r, .35 + rng.random() * .2), (.5 + rng.random() * .2, .45, .32 + rng.random() * .12),
             cols[i % 3], rng, sides=6 if hi else 5, rings=3 if hi else 2, flat=.5)
    for i in range(6 if hi else 3):
        a = rng.random() * math.tau; r = rng.random() * 1.0
        spray(wood, (math.cos(a) * r, math.sin(a) * r, .2), (math.cos(a) * r * 1.1, math.sin(a) * r * 1.1, .8 + rng.random() * .3), .025, BARK_DARK)
    return wood, leaf

def sand_sage(detail, rng):
    """Sand sagebrush: an airy, feathery silver-green shrub of fine sprays
    rising from a few woody stems."""
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    cols = [linear(0x9aa38c), linear(0x8c967e), linear(0xa6ab94)]
    for i in range(4 if hi else 2):
        a = i * 1.6
        stem(wood, (0, 0, 0), (math.cos(a) * .25, math.sin(a) * .25, .45), .03, .015, BARK_GREY, 3)
    for i in range(5 if hi else 3):
        a = i * 2.39996; r = .1 + (i / 5) * .35
        blob(leaf, (math.cos(a) * r, math.sin(a) * r, .55 + rng.random() * .2), (.3, .28, .24), cols[i % 3], rng, sides=5, rings=2, ragged=.3)
    for i in range(14 if hi else 6):
        a = rng.random() * math.tau; r = .25 + rng.random() * .3
        spray(leaf, (math.cos(a) * r * .5, math.sin(a) * r * .5, .45), (math.cos(a) * (r + .2), math.sin(a) * (r + .2), .75 + rng.random() * .25), .05, cols[i % 3])
    return wood, leaf

def tree(detail, rng, height, trunk_r, limbs, crown, cols, bark, fine=False):
    wood, leaf = Part(), Part()
    hi = detail == 'high'
    for (a0, a1, r0, r1) in limbs:
        stem(wood, a0, a1, r0 * trunk_r, r1 * trunk_r, bark, 5 if hi else 4)
    for i, (x, y, z, rx, ry, rz) in enumerate(crown if hi else crown[:max(3, len(crown) * 2 // 3)]):
        blob(leaf, (x, y, z), (rx, ry, rz), cols[i % len(cols)], rng, sides=(7 if hi else 5), rings=(3 if hi else 2),
             flat=.55 if fine else .2, ragged=.28 if fine else .16)
    return wood, leaf

def mesquite(detail, rng):
    """Honey mesquite: low and spreading, several leaning trunks, a fine
    open grey-green crown in flat layers. Never an umbrella on one pole."""
    limbs = [((0, 0, 0), (1.2, .3, 1.9), 1, .55), ((0, 0, 0), (-1.0, .6, 1.7), .9, .5), ((0, 0, 0), (.2, -1.1, 1.8), .85, .5),
             ((1.2, .3, 1.9), (2.0, .2, 2.7), .5, .3), ((-1.0, .6, 1.7), (-1.9, 1.0, 2.4), .45, .28), ((.2, -1.1, 1.8), (.4, -2.0, 2.5), .45, .28),
             ((.6, .1, 1.2), (.1, .3, 2.9), .5, .3)]
    crown = [(1.7, .3, 2.9, 1.1, .9, .38), (-1.6, .9, 2.7, 1.0, .9, .36), (.4, -1.8, 2.75, 1.0, .85, .34), (0, .2, 3.25, 1.2, 1.1, .4),
             (1.0, -.9, 3.1, .8, .7, .3), (-.8, -.6, 3.0, .85, .75, .3), (.6, 1.4, 3.05, .8, .7, .3)]
    cols = [linear(0x7d8566), linear(0x6f7a5c), linear(0x88896c)]
    return tree(detail, rng, 4, .16, limbs, crown, cols, BARK_DARK, fine=True)

def hackberry(detail, rng):
    """Hackberry: one stout grey trunk and a rounded crown going yellow."""
    limbs = [((0, 0, 0), (0, 0, 3.0), 1, .7), ((0, 0, 2.6), (1.4, .4, 5.0), .55, .3), ((0, 0, 2.7), (-1.2, .6, 5.2), .55, .3), ((0, 0, 2.8), (.2, -1.3, 5.4), .5, .3)]
    crown = [(0, 0, 6.0, 2.6, 2.4, 2.0), (1.6, .5, 5.2, 1.6, 1.4, 1.3), (-1.5, .6, 5.3, 1.6, 1.4, 1.3), (.2, -1.6, 5.4, 1.5, 1.4, 1.3), (0, .3, 7.4, 1.6, 1.5, 1.0)]
    cols = [linear(0x8a8a40), linear(0x7a7a3c), linear(0x969046)]
    return tree(detail, rng, 8, .26, limbs, crown, cols, BARK_GREY)

def elm(detail, rng):
    """American elm: a trunk forking low into a vase of rising limbs under
    a broad, arching yellow crown."""
    limbs = [((0, 0, 0), (0, 0, 3.2), 1, .75), ((0, 0, 3.0), (2.0, .4, 7.5), .6, .35), ((0, 0, 3.0), (-1.8, .8, 7.6), .6, .35), ((0, 0, 3.1), (.3, -2.0, 7.8), .55, .32)]
    crown = [(0, 0, 9.0, 3.4, 3.2, 1.8), (2.4, .5, 8.0, 2.0, 1.8, 1.4), (-2.2, .9, 8.1, 2.0, 1.8, 1.4), (.4, -2.4, 8.2, 1.9, 1.8, 1.4), (0, .4, 10.2, 2.2, 2.0, 1.0)]
    cols = [linear(0xa08a3c), linear(0x928240), linear(0xa89444)]
    return tree(detail, rng, 10.5, .32, limbs, crown, cols, BARK_GREY)

def cottonwood(detail, rng):
    """Plains cottonwood: a massive furrowed trunk and a huge, irregular
    crown of golden October leaves along the creek."""
    limbs = [((0, 0, 0), (0, 0, 4.5), 1, .7), ((0, 0, 4.0), (3.0, .6, 9.0), .6, .35), ((0, 0, 4.2), (-2.6, 1.2, 9.5), .6, .35), ((0, 0, 4.4), (.6, -3.0, 10.0), .55, .32), ((0, 0, 4.5), (.2, .4, 11.5), .5, .3)]
    crown = [(0, 0, 12.0, 4.4, 4.0, 3.0), (3.4, .8, 10.0, 2.8, 2.5, 2.2), (-3.0, 1.4, 10.4, 2.8, 2.5, 2.2), (.8, -3.4, 10.6, 2.6, 2.5, 2.1), (-.6, -.4, 14.0, 2.6, 2.4, 1.6), (2.0, 2.2, 12.6, 2.0, 1.8, 1.5)]
    cols = [linear(0xb89a3a), linear(0xa88c38), linear(0xc4a444)]
    return tree(detail, rng, 15, .5, limbs, crown, cols, BARK_GREY)

SPECIES = {
    'buckbrush': (buckbrush, .85), 'chokecherry': (chokecherry, 2.7), 'buffaloberry': (buffaloberry, 2.3), 'wild-rose': (wild_rose, .7),
    'sand-plum': (sand_plum, 1.75), 'shinnery': (shinnery, 1.0), 'sand-sage': (sand_sage, 1.0),
    'mesquite': (mesquite, 3.6), 'hackberry': (hackberry, 8.4), 'elm': (elm, 10.8), 'cottonwood': (cottonwood, 15.0),
}

def far_version(wood, leaf):
    """The distance version: one faceted mass per foliage extent and one
    trunk prism, keeping the silhouette and the colour mass."""
    fwood, fleaf = Part(), Part()
    if leaf.v:
        xs = [p[0] for p in leaf.v]; ys = [p[1] for p in leaf.v]; zs = [p[2] for p in leaf.v]
        avg = tuple(sum(c[k] for c in leaf.c) / len(leaf.c) for k in range(3))
        rng = random.Random(7)
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        blob(fleaf, (cx, cy, (min(zs) + max(zs)) / 2), ((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(zs) - min(zs)) / 2),
             shade(avg, 1.05), rng, sides=6, rings=2, ragged=.12, light=(.8, 1.05))
    if wood.v and max(p[2] for p in wood.v) > 1.5:
        zs = [p[2] for p in leaf.v] if leaf.v else [1]
        stem(fwood, (0, 0, 0), (0, 0, min(zs) + .3), .25 * (max(zs) / 10 + .2), .12 * (max(zs) / 10 + .2), BARK_GREY, 3)
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
        rng = random.Random(sum(ord(ch) for ch in name) * 31)
        wood, leaf = make('lite' if detail == 'far' else detail, rng)
        if detail == 'far':
            wood, leaf = far_version(*make('lite', random.Random(sum(ord(ch) for ch in name) * 31)))
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
