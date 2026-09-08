"""Authored South Gate tree kit; -- --export-only preserves manual .blend edits."""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(sys.argv[sys.argv.index('--out-dir')+1]).resolve() if '--out-dir' in sys.argv else ROOT/'public/models/quail-kit';SOURCE=ROOT/'assets/source/quail-kit/field-trees.blend'
OUT.mkdir(parents=True,exist_ok=True)
# x/y are plan coordinates, z is Blender's vertical axis. Sizes are metres.
CROWNS={
 'upright':[(-.5,-.2,6.8,1.65,1.3,1.7),(.8,.4,5.5,1.8,1.4,1.4),(-1.5,.35,5,1.7,1.25,1.3),(.25,-1.15,6.1,1.8,1.2,1.5),(-.2,1.25,6.25,1.55,1.2,1.35),(.25,0,7.3,1.4,1.05,1.25)],
 'spreading':[(-1.75,.1,5.15,1.9,1.3,1.2),(.9,-1.2,5.85,2,1.4,1.15),(1.95,.9,4.95,1.75,1.2,1.1),(-.15,1.75,5.9,1.85,1.2,1.2),(-1.05,-1.2,6.4,1.65,1.25,1.15),(.3,.1,6.85,1.9,1.4,1.3)],
 'leaning':[(-.6,.3,5.2,1.7,1.3,1.35),(.9,.6,6.35,1.85,1.25,1.35),(.3,1.6,5.9,1.7,1.4,1.2),(-.8,1.4,6.85,1.5,1.2,1.2),(1.6,1.7,7.05,1.6,1.15,1.15),(.2,.6,7.35,1.3,1.1,1.1)]}
OUTLINE=[(-1,-.15),(-.73,-.68),(-.22,-.86),(.18,-.60),(.6,-.91),(1,-.31),(.76,.1),(1,.49),(.3,.90),(-.1,.64),(-.82,.87),(-.67,.2)]
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.95;return m

def branch(v,f,a,b,r0,r1):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0))).normalized();w=axis.cross(u).normalized();start=len(v);n=6
 for p,r in [(a,r0),(b,r1)]:
  for i in range(n):v.append(tuple(p+(u*math.cos(i*math.tau/n)+w*math.sin(i*math.tau/n))*r))
 for i in range(n):j=(i+1)%n;f.extend([(start+i,start+j,start+n+i),(start+j,start+n+j,start+n+i)])
 f.extend([tuple(start+i for i in reversed(range(n))),tuple(start+n+i for i in range(n))])

def fan(v,f,center,size,angle,detail,seed):
 outline=OUTLINE if detail=='high' else OUTLINE[::2];n=len(outline);start=len(v);cx,cy,cz=center;rx,ry,rz=size;c,s=math.cos(angle),math.sin(angle)
 for row,(height,width) in enumerate([(-.35,.58),(-.03,1),(.39,.78),(.66,.24)]):
  for i,(x,y) in enumerate(outline):
   # Each fan has a lobed, asymmetric rim and an off-centre upper shoulder.
   x=x*width+.10*height;y=y*width-.16*height
   xx=x*rx;yy=y*ry;v.append((cx+xx*c-yy*s,cy+xx*s+yy*c,cz+height*rz+.055*math.sin(i*1.7+seed)))
 for row in range(3):
  for i in range(n):a=start+row*n+i;b=start+row*n+(i+1)%n;f.extend([(a,b,a+n),(b,b+n,a+n)])
 # Cap fans around centroids preserve the notched boundary without filling across it.
 for row,reverse in [(0,True),(3,False)]:
  center_index=len(v);points=v[start+row*n:start+(row+1)*n];v.append(tuple(sum(p[k] for p in points)/n for k in range(3)))
  for i in range(n):a=start+row*n+i;b=start+row*n+(i+1)%n;f.append((center_index,b,a) if reverse else (center_index,a,b))

def mesh(name,v,f,mat,parent):
 data=bpy.data.meshes.new(name);data.from_pydata(v,[],f);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.parent=parent;obj.data.materials.append(mat)

def author():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bark=material('Tree / bark',(.12,.085,.055));leaf=material('Tree / leaves',(.13,.205,.10));roots=[]
 for habit,crowns in CROWNS.items():
  for detail in ['high','lite']:
   root=bpy.data.objects.new('field-tree-'+habit+'-'+detail,None);bpy.context.collection.objects.link(root);roots.append(root)
   lean=.75 if habit=='leaning' else .1;fork=(.1,.1,2.65);spine=(-.15,lean,5.5);v=[];f=[]
   branch(v,f,(0,0,-.10),fork,.28,.19);branch(v,f,fork,spine,.19,.10);branch(v,f,spine,(.15,lean+.12,7.25),.10,.018)
   for i,(x,y,z,rx,ry,rz) in enumerate(crowns):
    elbow=(x*.63,y*.63,z*.65);branch(v,f,fork,elbow,.13 if i<2 else .09,.045);branch(v,f,elbow,(x,y,z+.12),.045,.009)
   mesh(root.name+' / trunk',v,f,bark,root);v=[];f=[]
   for i,(x,y,z,rx,ry,rz) in enumerate(crowns):
    angle=i*1.18+(0 if habit=='upright' else .43);fan(v,f,(x,y,z),(rx,ry,rz),angle,detail,i*.71)
    for j in range(2):
     a=angle+j*2.25+.7;fan(v,f,(x+math.cos(a)*rx*.72,y+math.sin(a)*ry*.72,z-.13+j*.24),(rx*.37,ry*.43,rz*.58),a,detail,i+j*.8)
   mesh(root.name+' / crown',v,f,leaf,root)
 for i,root in enumerate(roots):root.location=(i%2*12,i//2*12,0)
 return roots

if '--export-only' in sys.argv:
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE));roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY' and o.name.startswith('field-tree-')]
else:roots=author()
report=[]
for root in roots:
 previous=root.location.copy();root.location=(0,0,0);bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for child in root.children:child.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=str(OUT/(root.name+'.glb')),use_selection=True,export_format='GLB',export_yup=True)
 triangles=0
 for child in root.children:child.data.calc_loop_triangles();triangles+=len(child.data.loop_triangles)
 report.append({'id':root.name,'triangles':triangles,'meshes':len(root.children),'materials':2,'bytes':(OUT/(root.name+'.glb')).stat().st_size})
 root.location=previous
if '--export-only' not in sys.argv:bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT/'tree-manifest.json').write_text(json.dumps({'units':'metres','referenceHeight':8,'source':str(SOURCE.relative_to(ROOT)),'assets':report},indent=2));print(json.dumps(report))
