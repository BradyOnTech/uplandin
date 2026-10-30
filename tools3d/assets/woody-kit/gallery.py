"""Contact sheet of the exported woody kit, read back from the GLBs the
game loads: each species in a column, high / lite / far in rows, seen from
eye height so a silhouette that reads as stone or as an umbrella shows.

  tools3d/heavy.sh /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools3d/assets/woody-kit/gallery.py -- <out.png> [species,species,...]
"""
import bpy, sys, math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
KIT = ROOT / 'public/models/woody-kit'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = args[0] if args else str(ROOT / 'output/woody-kit-gallery.png')
species = args[1].split(',') if len(args) > 1 else ['buckbrush', 'wild-rose', 'buffaloberry', 'chokecherry']

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
x = 0.0
widest = 0.0
for column, name in enumerate(species):
    span = 0.0
    for row, detail in enumerate(('high', 'lite', 'far')):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(KIT / f'{name}-{detail}.glb'))
        meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
        for o in meshes:
            if o.data.color_attributes:
                o.data.color_attributes.active_color = o.data.color_attributes[0]
            span = max(span, max(abs(v.co.x) for v in o.data.vertices) * 2, max(abs(v.co.y) for v in o.data.vertices) * 2)
        for o in set(bpy.data.objects) - before:
            o['gallery_column'], o['gallery_row'] = column, row
    gap = max(2.0, span * 1.15)
    for o in bpy.data.objects:
        if o.get('gallery_column') == column and o.parent is None:
            o.location = (x + gap * (o['gallery_row'] + .5), 0, 0)
    x += gap * 3.4
    widest = max(widest, span)

# Ground plane in a prairie litter tone, so values read as they will.
bpy.ops.mesh.primitive_plane_add(size=400, location=(x / 2, 0, 0))
ground = bpy.context.active_object
mat = bpy.data.materials.new('ground'); mat.diffuse_color = (.32, .26, .17, 1); ground.data.materials.append(mat)

tallest = max((max((o.matrix_world @ v.co).z for v in o.data.vertices) for o in bpy.data.objects if o.type == 'MESH' and o is not ground), default=2)
cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 35
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
depth = 0
distance = max(x * .62, tallest * 2.4, 6)
cam.location = (x / 2, -distance, max(1.6, tallest * .5))
direction = Vector((x / 2, depth / 2, tallest * .35)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

scene.render.engine = 'BLENDER_WORKBENCH'
shading = scene.display.shading
shading.light = 'STUDIO'; shading.color_type = 'VERTEX'; shading.show_shadows = True
shading.show_cavity = False
scene.display.shadow_focus = .2
scene.world = bpy.data.worlds.new('w') if not scene.world else scene.world
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.render.film_transparent = False
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('gallery', out)
