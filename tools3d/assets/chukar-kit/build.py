"""Editable, vertex-painted basalt kit. Run Blender --background --python this-file.

-- --export-only preserves edits in the saved source gallery. Units are metres;
each exported rock has its origin at the middle of its buried foot.
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/models/chukar-kit'
SOURCE = ROOT / 'assets/source/chukar-kit/basalt-kit.blend'
REVIEW = ROOT / 'docs/3d/chukar-production'
for folder in (OUT, SOURCE.parent, REVIEW):
    folder.mkdir(parents=True, exist_ok=True)

def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

def paint(rgb, value=1):
    return tuple(linear(max(0, min(1, c * value))) for c in rgb) + (1,)

def make_brow(variant, detail, material):
    rng = random.Random(3911 + variant * 311)
    vertices, faces, colors = [], [], []
    # Connected irregular columns give a fractured rock mass. There are no
    # separate stacked blocks, uniform horizontal gaps or repeated box caps.
    count = 11
    width = 19
    outline = [(-.52,-.38),(-.18,-.57),(.39,-.45),(.56,-.03),(.36,.43),(-.28,.49),(-.57,.13)]
    if detail == 'lite':
        outline = [outline[i] for i in (0,1,2,4,5)]
    n = len(outline)
    for i in range(count):
        shading = random.Random(711 + variant * 411 + i * 31)
        u = i / (count - 1)
        x = (u - .5) * width
        envelope = .60 + .40 * math.sin(math.pi * (.12 + .76 * u))
        if variant == 1:
            envelope *= .86 + .14 * math.sin(u * 6 + 1)
        elif variant == 2:
            envelope *= .78 if i in (count // 2, count // 2 + 1) else 1
        height = (7.2 + rng.random() * 2.0) * envelope
        depth = 5.3 + rng.random() * 2.1
        column_width = width / (count - 1) * (1.14 + rng.random() * .24)
        cy = math.sin(u * 4.7 + variant) * .8
        start = len(vertices)
        rings = [(0,1.14),(.09,1.05),(.48,1),(.53,.94),(.92,.87),(1,.76)] if detail == 'high' else [(0,1.1),(.48,1),(.91,.88),(1,.76)]
        lean = (rng.random() - .5) * .65
        for level, spread in rings:
            for j,(ox,oy) in enumerate(outline):
                # Broad planes stay quiet; small opposing offsets form
                # cracks and chamfered upper lips without pebble noise.
                vertices.append((x + ox * column_width * spread + level * lean,
                    cy + oy * depth * spread + math.sin(i * 2.3) * level * .35,
                    level * height + (math.sin(j * 1.3 + i) * .16 if level > 0 else 0)))
        base = (.37 + rng.random() * .045, .36 + rng.random() * .038, .335 + rng.random() * .03)
        for ring in range(len(rings) - 1):
            for j in range(n):
                nxt = (j + 1) % n
                a,b,c,d = start+ring*n+j,start+ring*n+nxt,start+(ring+1)*n+nxt,start+(ring+1)*n+j
                faces.append((a,b,c,d))
                colors.append(paint(base, .80 + shading.random() * .26 + (.14 if ring == len(rings)-2 else 0)))
        faces.append(tuple(start + (len(rings)-1)*n + j for j in range(n)))
        colors.append(paint((.48,.445,.377), .95 + shading.random() * .12))
        faces.append(tuple(start + j for j in reversed(range(n))))
        colors.append(paint(base,.7))
    # Broken foot slabs interrupt the continuous face and tie the formation
    # into loose talus. Major fragments are identical in both quality tiers.
    rubble = random.Random(721 + variant * 67)
    for i in range(7):
        cx=(i/6-.5)*18+(rubble.random()-.5)*1.8
        cy=-3.9-rubble.random()*1.5
        rx=1.1+rubble.random()*1.4;ry=1.1+rubble.random()*1.2;h=.6+rubble.random()*2.5
        start=len(vertices)
        for level,spread in [(0,1.06),(.68,.9),(1,.58)]:
            for j in range(6):
                angle=j*math.pi/3+.25
                vertices.append((cx+math.cos(angle)*rx*spread+level*.28,cy+math.sin(angle)*ry*spread,level*h))
        for ring in range(2):
            for j in range(6):
                nxt=(j+1)%6;faces.append((start+ring*6+j,start+ring*6+nxt,start+(ring+1)*6+nxt,start+(ring+1)*6+j))
                colors.append(paint((.40,.39,.35),.85+((i+j)%4)*.05))
        faces.append(tuple(start+12+j for j in range(6)));colors.append(paint((.51,.47,.39)))
    name = ['basalt-brow','weathered-shelf','split-shoulder'][variant] + '-' + detail
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    attr = data.color_attributes.new(name='RockPaint', type='FLOAT_COLOR', domain='CORNER')
    for face, color in zip(data.polygons, colors):
        face.use_smooth = False
        for index in face.loop_indices:
            attr.data[index].color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

if '--export-only' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rocks = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('chukar_asset')]
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    material = bpy.data.materials.new('Basalt / vertex paint')
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .92
    vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'RockPaint'
    material.node_tree.links.new(vertex.outputs['Color'],bsdf.inputs['Base Color'])
    rocks = []
    for variant in range(3):
        for detail in ('high','lite'):
            obj = make_brow(variant, detail, material)
            obj['chukar_asset'] = True
            rocks.append(obj)

report=[]
for i,obj in enumerate(rocks):
    obj.location=(0,0,0)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    path=OUT/(obj.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_yup=True)
    obj.data.calc_loop_triangles()
    report.append({'id':obj.name,'triangles':len(obj.data.loop_triangles),'bytes':path.stat().st_size,
                   'materials':len(obj.data.materials),'dimensions':list(obj.dimensions)})
    obj.location=(i%2*27,i//2*17,0)

if '--export-only' not in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT/'manifest.json').write_text(json.dumps({'units':'metres','source':str(SOURCE.relative_to(ROOT)),'assets':report},indent=2)+'\n')

# One neutral studio plate for shape review, independent of game acceptance.
for i,obj in enumerate(rocks):
    obj.hide_render = i%2==1
    if i%2==0: obj.location=((i//2-1)*25,0,0)
world=bpy.context.scene.world or bpy.data.worlds.new('Studio')
bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.43,.48,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.7
light_data=bpy.data.lights.new('Broad morning key','AREA');light_data.energy=4500;light_data.shape='DISK';light_data.size=25
light=bpy.data.objects.new('Broad morning key',light_data);bpy.context.collection.objects.link(light);light.location=(-15,-18,35)
light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('Rock kit camera');camera=bpy.data.objects.new('Rock kit camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=(33,-68,27);camera.rotation_euler=(Vector((0,0,4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=84
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1680;scene.render.resolution_y=840;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(REVIEW/'basalt-kit.png');bpy.ops.render.render(write_still=True)
print(json.dumps(report))
