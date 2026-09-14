"""Editable, vertex-painted basalt kit. Run Blender --background --python this-file.

-- --export-only preserves edits in the saved source gallery. Units are metres;
each exported rock has its origin at the middle of its buried foot.
"""
import bpy
import bmesh
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
        # Fractured volumes, not extruded rings: each point varies in all
        # three axes. The convex hull gives broad oblique break planes with
        # chipped corners and an uneven crown, without a flat polygon lid.
        bm=bmesh.new()
        bmesh.ops.create_icosphere(bm,subdivisions=1 if rubble else 2,radius=1)
        bm.verts.ensure_lookup_table()
        ca,sa=math.cos(angle),math.sin(angle)
        for v in bm.verts:
            d=v.co.normalized()
            warp=1+.12*math.sin(d.x*5.3+identity)+.08*math.sin(d.z*6.1+d.y*3.8+variant)
            x=math.copysign(abs(d.x)**.86,d.x)*warp
            y=math.copysign(abs(d.y)**.92,d.y)*warp
            z=d.z*(.90+.12*math.sin(d.x*3.8+identity*.8))
            # Different fracture directions break the crown and side profile.
            x+=z*.24+z*z*math.sin(identity*1.8)*.15
            y+=z*.18*math.cos(identity*2.1)
            z=min(z,.81+x*.14-y*.11)
            z=max(z,-.85+x*.09)
            lx=x*width*.52+(z+.85)*lean*.5
            ly=y*depth*.55
            v.co=(cx+lx*ca-ly*sa,cy+lx*sa+ly*ca,(z+.85)*height/1.72)
        points=[v.co.copy() for v in bm.verts]
        bm.clear()
        for point in points:bm.verts.new(point)
        hull=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        bmesh.ops.delete(bm,geom=hull['geom_interior'],context='VERTS')
        bm.verts.ensure_lookup_table();bm.verts.index_update();bm.normal_update()
        start=len(vertices)
        vertices.extend(tuple(v.co) for v in bm.verts)
        base=(.465+variant*.009,.443+variant*.006,.397+variant*.006)
        for face in bm.faces:
            faces.append(tuple(start+v.index for v in face.verts))
            center=face.calc_center_median()
            # Coherent mineral weathering over multiple faces; restrained
            # color differences let the lighting reveal the fracture planes.
            stain=.035*math.sin(center.x*.7+center.z*.4)+.025*math.sin(center.y*1.3-center.z*.9)
            exposure=max(0,face.normal.z)
            shade=.94+stain+exposure*.14
            colors.append(paint(base,shade))
        bm.free()

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
    if detail=='lite':
        # Simplify the authored fracture surface instead of starting from
        # a different primitive; both tiers keep the same major corners.
        bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('Preserve fracture silhouette','DECIMATE')
        modifier.ratio=.60
        bpy.ops.object.modifier_apply(modifier=modifier.name)
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
