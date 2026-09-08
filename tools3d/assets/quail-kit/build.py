"""Editable sand-plum prototype kit. Run with Blender --background --python this-file."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/models/quail-kit'
SOURCE = ROOT / 'assets/source/quail-kit'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=.95
    return mat
wood=material('Plum / weathered stems',(.17,.13,.085))
leaf=material('Plum / summer olive',(.20,.27,.105))

# Deliberately unequal canopy fans: no uniform ball crown, exposed forks below.
HABITS = {
 'sand-plum-open': [(-.62,.03,.89,.51,.36,.32),(.38,-.29,1.22,.58,.43,.39),(.68,.33,.82,.43,.39,.30),(-.10,.52,1.03,.49,.37,.34),(-.48,-.42,1.30,.38,.35,.27)],
 'sand-plum-low': [(-.66,.14,.66,.56,.42,.30),(.48,-.39,.79,.58,.37,.29),(.55,.41,.59,.51,.43,.24),(-.13,.5,.84,.45,.34,.30),(-.28,-.40,.96,.40,.33,.30)],
 'sand-plum-tall': [(-.39,.05,1.24,.45,.38,.40),(.28,-.33,1.62,.46,.40,.42),(.52,.27,1.13,.40,.34,.32),(-.08,.43,1.43,.42,.32,.38),(-.37,-.33,1.75,.34,.31,.30)],
}

def mesh_object(name, vertices, faces, mat, parent):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.parent=parent;obj.data.materials.append(mat)
    return obj

def stem(vertices, faces, start, end, radius, sides=5):
    a,b=Vector(start),Vector(end);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u).normalized();offset=len(vertices)
    for p,r in [(a,radius),(b,radius*.32)]:
        for i in range(sides):vertices.append(tuple(p+(u*math.cos(i*2*math.pi/sides)+v*math.sin(i*2*math.pi/sides))*r))
    for i in range(sides):j=(i+1)%sides;faces.extend([(offset+i,offset+j,offset+sides+i),(offset+j,offset+sides+j,offset+sides+i)])
    faces.extend([tuple(offset+i for i in reversed(range(sides))),tuple(offset+sides+i for i in range(sides))])

def leaf_fan(vertices, faces, center, radii, angle, detail, seed):
    """Flattened foliage with a broken rim, rather than a closed oval lobe."""
    sides=10 if detail=='high' else 6
    offset=len(vertices);x,y,z=center;rx,ry,rz=radii
    for row,(h,r) in enumerate([(-.38,.48),(0,1),(.44,.64)]):
      for i in range(sides):
        a=i*math.tau/sides+angle
        edge=(.65 if i%2 else 1.08)+.10*math.sin(i*1.9+seed)
        vertices.append((x+math.cos(a)*rx*r*edge+h*.08,y+math.sin(a)*ry*r*edge-h*.10,z+h*rz+.035*math.sin(a*3+seed)))
    for row in range(2):
      for i in range(sides):
        a=offset+row*sides+i;b=offset+row*sides+(i+1)%sides
        faces.extend([(a,b,a+sides),(b,b+sides,a+sides)])
    for row,reverse in [(0,True),(2,False)]:
      points=vertices[offset+row*sides:offset+(row+1)*sides];mid=len(vertices)
      vertices.append(tuple(sum(p[k] for p in points)/sides for k in range(3)))
      for i in range(sides):
        a=offset+row*sides+i;b=offset+row*sides+(i+1)%sides
        faces.append((mid,b,a) if reverse else (mid,a,b))

roots=[];report=[]
for name, crown in HABITS.items():
 # Lower suckers make woody escape cover, not a miniature ornamental tree.
 height = 1.2 if name.endswith('tall') else .8 if name.endswith('low') else 1
 fans = crown + [(-.22,.16,.42*height,.40,.32,.28),(.24,-.15,.67*height,.43,.34,.34),(.05,.26,.91*height,.41,.33,.32)]
 for detail in ['high','lite']:
    parent=bpy.data.objects.new(name+'-'+detail,None);bpy.context.collection.objects.link(parent);roots.append(parent)
    vertices=[];faces=[]
    for n,(x,y,z,rx,ry,rz) in enumerate(fans):
        fork=(x*.28,y*.28,z*.43);stem(vertices,faces,(x*.07,y*.07,0),fork,.025 if n%2 else .034)
        stem(vertices,faces,fork,(x,y,z),.018)
        stem(vertices,faces,(x*.55,y*.55,z*.65),(x+rx*.6,y-ry*.4,z+.06),.01)
    mesh_object(parent.name+' / stems',vertices,faces,wood,parent)
    vertices=[];faces=[]
    for n,(x,y,z,rx,ry,rz) in enumerate(fans):
      angle=n*2.399
      leaf_fan(vertices,faces,(x,y,z),(rx*.85,ry*.85,rz),angle,detail,n*.7)
      # Smaller side shoots overlap the core while opening gaps in its outline.
      for j in range(2):
        a=angle+j*2.05+.4
        leaf_fan(vertices,faces,(x+math.cos(a)*rx*.60,y+math.sin(a)*ry*.60,z+(-.19 if j==0 else .24)*rz),
                 (rx*.48,ry*.48,rz*.64),a,detail,n+j*.8)
    mesh_object(parent.name+' / foliage',vertices,faces,leaf,parent)
    bpy.ops.object.select_all(action='DESELECT');parent.select_set(True)
    for child in parent.children:child.select_set(True)
    bpy.context.view_layer.objects.active=parent
    bpy.ops.export_scene.gltf(filepath=str(OUT/(parent.name+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT')
    tris=0
    for child in parent.children:child.data.calc_loop_triangles();tris+=len(child.data.loop_triangles)
    report.append({'id':parent.name,'triangles':tris,'materials':2,'meshes':2,'bytes':(OUT/(parent.name+'.glb')).stat().st_size})
# Source gallery: separate roots on a grid after origin-correct exports.
for i,parent in enumerate(roots):parent.location=(i%2*3.3,i//2*3.3,0)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'sand-plum-kit.blend'))
(OUT/'manifest.json').write_text(json.dumps({'version':2,'units':'metres','source':'assets/source/quail-kit/sand-plum-kit.blend','status':'prototype; integrated in South Gate cover groups; visual review required','assets':report},indent=2))
print(json.dumps(report))
