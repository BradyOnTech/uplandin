"""Reproduce the head-only typed surface; run with Blender --background --python this-file.
The existing saved source is opened read-only and never saved or modified.
"""
import bpy,bmesh,json,hashlib,collections,argparse,sys
from mathutils import Vector
from pathlib import Path
parser=argparse.ArgumentParser(description='Derive the code-owned low-poly GSP head surface from the saved source mesh; no rig or textures are exported.')
parser.add_argument('--output-dir',default='output/generated-gsp-source-head')
parser.add_argument('--table-output',default='src/three/dogs/generatedGspHeadData.ts')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
BASE=Path(args.output_dir);BASE.mkdir(parents=True,exist_ok=True);SOURCE=Path('assets/source/gsp/gsp-liver-white.blend')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE.resolve()))
rig=bpy.data.objects['GSP_Rig'];rig.data.pose_position='REST';source=bpy.data.objects['GSP_LiverWhite_LOD0']
reports=[]
for detail,target in [('high',1100),('lite',670)]:
 ob=source.copy();ob.data=source.data.copy();bpy.context.collection.objects.link(ob);ob.name='Head reference table '+detail
 for m in list(ob.modifiers):ob.modifiers.remove(m)
 bm=bmesh.new();bm.from_mesh(ob.data)
 # Preserve the original coincident upper/lower lip landmarks exactly
 # through reduction, so two separately weighted surfaces still close.
 points=collections.defaultdict(list)
 for v in ob.data.vertices:
  if -v.co.y>.43:points[tuple(round(x,5)for x in v.co)].append(v)
 anchors=[]
 for vs in points.values():
  jaws=[sum(g.weight for g in v.groups if ob.vertex_groups[g.group].name=='Jaw')for v in vs]
  if len(vs)>1 and max(jaws)-min(jaws)>.1: anchors.extend(v.index for v in vs)
 anchor_positions=[ob.data.vertices[i].co.copy()for i in anchors]
 protected=set(anchors)
 for e in ob.data.edges:
  if any(i in anchors for i in e.vertices):protected.update(e.vertices)
 protect=ob.vertex_groups.new(name='Preserve lip seam');protect.add(list(protected),1,'REPLACE')
 # Trim source throat under the cranial/mandibular junction. Ear leather
 # is a separate weighted component and is not clipped by the neck plane.
 bm.free();bm=bmesh.new();bm.from_mesh(ob.data);d=bm.verts.layers.deform.active
 ear_groups={g.index for g in ob.vertex_groups if g.name.startswith('Ear')}
 earverts={v for v in bm.verts if any(v[d].get(k,0)>.05 for k in ear_groups)}
 geom=[v for v in bm.verts if v not in earverts]+[e for e in bm.edges if not any(v in earverts for v in e.verts)]+[f for f in bm.faces if not any(v in earverts for v in f.verts)]
 bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-7,plane_co=(0,-.34,.70),plane_no=(0,-.35,1),clear_inner=True,clear_outer=False)
 
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,-.34,0),plane_no=(0,1,0),clear_outer=True,clear_inner=False)
 bm.to_mesh(ob.data);bm.free();ob.data.update();ob.data.calc_loop_triangles();count=len(ob.data.loop_triangles)
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 mod=ob.modifiers.new('Head-only planar simplification','DECIMATE');mod.ratio=target/count;mod.use_collapse_triangulate=True;mod.vertex_group='Preserve lip seam';mod.vertex_group_factor=1000;mod.invert_vertex_group=True
 bpy.ops.object.modifier_apply(modifier=mod.name);ob.data.calc_loop_triangles()
 verts=[]
 for v in ob.data.vertices:
  w={ob.vertex_groups[g.group].name:g.weight for g in v.groups}
  p=v.co;vs=[p.x*.8,-.027+(p.z-.687)*.8,.026+(-p.y-.435)*.8]
  earL=w.get('EarBase.L',0)+w.get('EarTip.L',0);earR=w.get('EarBase.R',0)+w.get('EarTip.R',0);jaw=w.get('Jaw',0)
  if earL+earR>.05:
   t=max(0,min(1,(.042-vs[1])/.035));ear_amount=t*t*(3-2*t)
   weights={'ear-right'if earL>earR else'ear-left':ear_amount,'head':1-ear_amount}
  elif jaw>.001: weights={'jaw':jaw,'head':1-jaw}
  else:weights={'head':1}
  smooth=lambda t:(lambda q:q*q*(3-2*q))(max(0,min(1,t)))
  nasal=smooth((-p.y-.586)/.026)*smooth((p.z-.682)/.015)
  verts.append({'p':[round(x,7)for x in vs],'w':weights,'nose':round(nasal,6),'source':[p.x,p.z,-p.y]})
 faces=[];uv=ob.data.uv_layers.active
 for t in ob.data.loop_triangles:
  p=ob.data.polygons[t.polygon_index];avg=[sum(verts[i]['source'][j]for i in t.vertices)/3 for j in range(3)]
  color='liver'
  if p.material_index==1:
   slot=int(uv.data[t.loops[0]].uv.x*4);color=['eye','eye','pupil','liver'][min(3,max(0,slot))]
  elif avg[2]>.592 and avg[1]>.696:color='nose'
  faces.append({'v':list(t.vertices),'color':color})
 for v in verts:del v['source']
 data={'source':str(SOURCE),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'method':'Head-only source-guided simplified surface. Source body, rig, animation and textures excluded. Existing generated skeleton remains runtime authority. Uniform .8 scale around source jaw hinge into generated jaw hinge.','vertices':verts,'faces':faces}
 pairs=[];unique_anchors={tuple(round(q,7)for q in p):p for p in anchor_positions}
 for p in unique_anchors.values():
  local=[p.x*.8,-.027+(p.z-.687)*.8,.026+(-p.y-.435)*.8]
  match=[i for i,v in enumerate(verts)if sum((a-b)**2 for a,b in zip(v['p'],local))<1e-12]
  assert len(match)==2,'Paired lip vertices must survive simplification'
  pairs.append(match)
 data['lipPairs']=pairs
 (BASE/('head-'+detail+'.json')).write_text(json.dumps(data,separators=(',',':')))
 seam_after=[v.co.copy()for v in ob.data.vertices if any((v.co-p).length<1e-6 for p in anchor_positions)]
 assert len(seam_after)==len(anchor_positions), 'Reduction lost a protected lip vertex'
 used={i for f in faces for i in f['v']}
 for p in anchor_positions:
  matched=[v.index for v in ob.data.vertices if (v.co-p).length<1e-6]
  assert len(matched)>=2 and all(i in used for i in matched), 'Upper/lower lip correspondence missing'
 reports.append({'protectedSeamVerticesBefore':len(anchors),'protectedSeamVerticesAfter':len(seam_after),'detail':detail,'sourceCutTriangles':count,'triangles':len(faces),'vertices':len(verts),'semanticFaces':{x:sum(f['color']==x for f in faces)for x in ['liver','nose','eye','pupil']}})
 bpy.data.objects.remove(ob,do_unlink=True)
(BASE/'extraction-report.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports))

# Typed authored tables are the only derived runtime payload. No Blender rig,
# imported textures, rest pose wrapper or unused source body is retained.
header="""/** Generated by tools3d/assets/gsp/extract_generated_head.py.
 * Source: assets/source/gsp/gsp-liver-white.blend (user-owned source-conforming surface).
 * The runtime uses its own head, jaw and ear bones; source rig/textures are excluded.
 */
/** Head-local metres xyz; owner 0 = head / 1 = jaw / 2 = left ear / 3 = right ear; owner weight; nasal pigment blend. */
export type GspHeadVertex = readonly [number, number, number, number, number, number];
/** Triangle indices abc; palette 0 = coat/nose blend, 1 = iris, 2 = pupil. */
export type GspHeadFace = readonly [number, number, number, number];
export interface GspHeadTable {
  readonly vertices: readonly GspHeadVertex[];
  readonly faces: readonly GspHeadFace[];
  readonly lipPairs: readonly (readonly [number, number])[];
}
"""
chunks=[header];owners={'head':0,'jaw':1,'ear-left':2,'ear-right':3}
for detail in ['high','lite']:
 data=json.loads((BASE/('head-'+detail+'.json')).read_text());vertices=[];faces=[]
 for v in data['vertices']:
  other=[(k,w)for k,w in v['w'].items()if k!='head' and w>0]
  assert len(other)<=1
  owner,amount=other[0] if other else ('head',0)
  vertices.append(v['p']+[owners[owner],round(amount,8),v['nose']])
 for f in data['faces']:faces.append(f['v']+[1 if f['color']=='eye' else 2 if f['color']=='pupil' else 0])
 compact=lambda v:json.dumps(v,separators=(',',':'))
 chunks.append('export const GSP_HEAD_'+detail.upper()+': GspHeadTable = {\n  vertices: [\n'+''.join('    '+compact(v)+',\n'for v in vertices)+'  ],\n  faces: [\n'+''.join('    '+compact(f)+',\n'for f in faces)+'  ],\n  lipPairs: '+compact(data['lipPairs'])+',\n};\n')
Path(args.table_output).parent.mkdir(parents=True,exist_ok=True);Path(args.table_output).write_text('\n'.join(chunks))
