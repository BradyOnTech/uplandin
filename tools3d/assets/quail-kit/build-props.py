"""Weathered ground props in metres. -- --export-only preserves saved edits."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets/source/quail-kit/ground-props.blend'
OUT = Path(sys.argv[sys.argv.index('--out-dir') + 1]).resolve() if '--out-dir' in sys.argv else ROOT / 'public/models/quail-kit'
OUT.mkdir(parents=True, exist_ok=True)

def material(name, color):
    mat = bpy.data.materials.new(name); mat.diffuse_color = (*color, 1); mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF'); node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .98
    return mat

def mesh(name, vertices, faces, materials, assignments, root):
    data = bpy.data.meshes.new(name); data.from_pydata(vertices, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj); obj.parent = root
    for mat in materials: data.materials.append(mat)
    for polygon, index in zip(data.polygons, assignments): polygon.material_index = index

def timber(vertices, faces, assignments, a, b, radius, end_radius, sides, seed):
    a, b = Vector(a), Vector(b); axis = (b-a).normalized()
    u = axis.cross(Vector((0,0,1))).normalized(); v = axis.cross(u).normalized(); start = len(vertices)
    # An irregular centre ring and chipped end avoid a perfect cylinder.
    for row, (t, r) in enumerate([(0,radius),(.48,radius*.90),(1,end_radius)]):
        for i in range(sides):
            angle = i*math.tau/sides; irregular = 1 + .12*math.sin(i*2.1+seed)
            point = a.lerp(b,t) + (u*math.cos(angle)+v*math.sin(angle))*r*irregular
            if row == 1: point += u*(radius*.38) + v*(radius*.20)
            if row == 2: point += axis*(.075*math.sin(i*1.7+seed))
            vertices.append(tuple(point))
    for row in range(2):
        for i in range(sides):
            j=(i+1)%sides; q=start+row*sides
            faces.append((q+i,q+j,q+sides+j,q+sides+i)); assignments.append(1 if (i+row)%5==0 else 0)
    for row, reverse in [(0,True),(2,False)]:
        cap=[start+row*sides+i for i in range(sides)]
        faces.append(tuple(reversed(cap)) if reverse else tuple(cap)); assignments.append(2)

def author():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bark=material('Weathered wood / grey bark',(.19,.165,.125))
    worn=material('Weathered wood / worn ridge',(.29,.255,.19))
    end=material('Weathered wood / exposed grain',(.36,.30,.205))
    stone=material('Field stone / warm limestone',(.30,.285,.235))
    edge=material('Field stone / weathered edge',(.24,.235,.20))
    roots=[]
    for habit in ['slab','split-log','fallen-limb']:
        for detail in ['high','lite']:
            root=bpy.data.objects.new('ground-prop-'+habit+'-'+detail,None); bpy.context.collection.objects.link(root); roots.append(root)
            vertices=[]; faces=[]; assignments=[]; n=10 if detail=='high' else 6
            if habit=='slab':
                for row,(z,scale) in enumerate([(-.018,.73),(.10,1),(.29,.77)]):
                    for i in range(n):
                        a=i*math.tau/n; r=1+.13*math.sin(i*1.9)
                        vertices.append((math.cos(a)*.86*scale*r+.08*row,math.sin(a)*.49*scale*r,z+(0 if row==0 else .025*math.sin(i*2.7))))
                for row in range(2):
                    for i in range(n):
                        j=(i+1)%n; faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i)); assignments.append(1 if row==0 else 0)
                vertices.append((.16,0,.32)); center=len(vertices)-1
                for i in range(n):faces.append((center,2*n+i,2*n+(i+1)%n));assignments.append(0)
                faces.append(tuple(reversed(range(n))));assignments.append(1)
                mats=[stone,edge]
            else:
                mats=[bark,worn,end]
                if habit=='split-log':
                    timber(vertices,faces,assignments,(-1.15,0,.17),(1.05,.10,.18),.18,.14,n,2)
                    timber(vertices,faces,assignments,(-.10,.02,.26),(.20,.32,.49),.075,.035,n,3)
                    # Detached splinter resting beside the main trunk.
                    timber(vertices,faces,assignments,(-.64,-.28,.055),(.42,-.23,.09),.045,.018,n,4)
                else:
                    timber(vertices,faces,assignments,(-1.23,.12,.12),(.80,-.10,.10),.10,.055,n,1)
                    timber(vertices,faces,assignments,(-.20,0,.12),(.70,.63,.12),.065,.018,n,2)
                    timber(vertices,faces,assignments,(.21,-.04,.12),(1.10,-.43,.07),.038,.012,n,3)
            minimum=min(p[2] for p in vertices)
            vertices=[(x,y,z-minimum-.012) for x,y,z in vertices]
            mesh(root.name+' / surface',vertices,faces,mats,assignments,root)
    for i,root in enumerate(roots):root.location=(i%2*4,i//2*3,0)
    return roots

if '--export-only' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY' and o.name.startswith('ground-prop-')]
else: roots=author()
report=[]
for root in roots:
    previous=root.location.copy();root.location=(0,0,0);bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for child in root.children:child.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(OUT/(root.name+'.glb')),use_selection=True,export_format='GLB',export_yup=True)
    triangles=0
    for child in root.children:child.data.calc_loop_triangles();triangles+=len(child.data.loop_triangles)
    # Exporter splits primitives by material; match actual runtime mesh count.
    materials=len({m.name for child in root.children for m in child.data.materials})
    report.append({'id':root.name,'triangles':triangles,'meshes':materials,'materials':materials,'bytes':(OUT/(root.name+'.glb')).stat().st_size})
    root.location=previous
if '--export-only' not in sys.argv:bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT/'prop-manifest.json').write_text(json.dumps({'units':'metres','source':str(SOURCE.relative_to(ROOT)),'assets':report},indent=2)+'\n')
print(json.dumps(report))
