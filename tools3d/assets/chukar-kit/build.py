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
    vertices, faces, colors = [], [], []
    # Hand-arranged major masses. Each family has a different silhouette;
    # irregular widths and setbacks avoid the old row of equal columns.
    # x, y, width, depth, height, rotation, lean
    profiles = [
        [(-8, .5, 6.2, 6.3, 2.5, -.18, .5), (-4.8, .7, 6.7, 6.5, 5.5, .12, -.5),
         (-.8, 1.1, 7.4, 7.7, 9.4, -.09, -.7), (3.6, .4, 5.1, 6.4, 7.2, .24, .6),
         (7.1, .8, 5.8, 5.2, 4.3, -.2, .2), (-1.9, -2.4, 5.2, 3.5, 3.1, -.12, .35)],
        [(-7.8, .6, 6.6, 6.2, 3.2, -.17, .4), (-3.2, 1.2, 8.4, 7.2, 6.1, .08, -.3),
         (2.4, 1.3, 8.9, 6.8, 6.5, -.06, -.7), (7.6, .2, 5.3, 5.8, 4.7, .25, .3),
         (-2.8, -2.1, 8.2, 4.4, 2.3, -.1, .5), (4.4, -2.4, 6.5, 3.8, 2.8, .08, .35)],
        [(-8.1, .3, 6.0, 5.3, 2.7, -.25, .3), (-4.5, 1.0, 6.0, 7.2, 8.6, -.16, -.8),
         (-1.3, 1.8, 4.2, 6.3, 9.8, .24, -.65), (2.8, 1.6, 4.8, 6.5, 5.0, -.13, .4),
         (6.0, .7, 6.3, 6.1, 7.5, .15, .7), (9.0, -.1, 4.5, 4.3, 3.0, -.24, .3),
         (-.4, -2.8, 5.2, 3.6, 2.0, -.05, .4)],
    ]
    def mass(spec, identity, rubble=False):
        cx,cy,width,depth,height,angle,lean=spec
        rng=random.Random(3911+variant*311+identity*101)
        outline=[(-.52,-.30),(-.27,-.54),(.20,-.57),(.51,-.27),(.48,.23),(.14,.49),(-.41,.37)]
        if detail=='lite': outline=[outline[i] for i in (0,2,3,4,6)]
        n=len(outline);start=len(vertices)
        rings=[(0,1.12),(.12,1.02),(.43,.98),(.48,.90),(.87,.88),(1,.69)]
        if detail=='lite':rings=[(0,1.12),(.48,.94),(1,.70)]
        if rubble:rings=[(0,1.08),(.63,.93),(1,.57)] if detail=='high' else [(0,1.08),(1,.68)]
        ca,sa=math.cos(angle),math.sin(angle)
        for level,spread in rings:
            for j,(ox,oy) in enumerate(outline):
                lx=ox*width*spread+level*lean
                ly=oy*depth*spread+level*math.sin(identity*2.1)*.5
                # Tilted broken tops and unequal diagonal fractures give
                # each large plane a readable direction without fine noise.
                z=level*height+(ox*.65+math.sin(j*2.7+identity)*.20)*level
                vertices.append((cx+lx*ca-ly*sa,cy+lx*sa+ly*ca,z))
        shade_rng=random.Random(911+identity*51+variant*87)
        base=(.435+shade_rng.random()*.035,.425+shade_rng.random()*.03,.392+shade_rng.random()*.024)
        for ring in range(len(rings)-1):
            for j in range(n):
                nxt=(j+1)%n
                faces.append((start+ring*n+j,start+ring*n+nxt,start+(ring+1)*n+nxt,start+(ring+1)*n+j))
                shade=.89+shade_rng.random()*.23
                # Broad weathered shoulders; darker lower fissures.
                shade*=.83 if ring==0 else 1.12 if ring==len(rings)-2 else 1
                colors.append(paint(base,shade))
        faces.append(tuple(start+(len(rings)-1)*n+j for j in range(n)))
        colors.append(paint((.565,.518,.425),.91+shade_rng.random()*.12))
        faces.append(tuple(start+j for j in reversed(range(n))))
        colors.append(paint(base,.67))

    for i,spec in enumerate(profiles[variant]):mass(spec,i)
    # Large fallen wedges at the foot connect the brows to talus. Fixed
    # composition in both tiers; lightweight removes subdivisions only.
    rubble=random.Random(721+variant*67)
    for i in range(7):
        x=(i/6-.5)*19+(rubble.random()-.5)*2
        mass((x,-3.1-rubble.random()*1.4,2.0+rubble.random()*2.4,2.3+rubble.random()*1.7,
              .5+rubble.random()*1.45,(rubble.random()-.5)*.8,.35),30+i,True)
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
