"""Bake edited Rigify clips and legacy fallbacks into a temporary game skeleton.
Never regenerates mesh/poses and never saves over the input .blend. Artist actions
named CTRL_<clip> replace only that named runtime clip; all other manifest clips
retain their direct game-bone action. Diagnostic --clips exports only that subset.

Blender --background --python export_rigify.py -- --source edited.blend --output dog.glb
"""
import argparse,json,sys,struct,hashlib
from copy import deepcopy
from pathlib import Path
import bpy
from mathutils import Matrix

ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--source',required=True)
destination=p.add_mutually_exclusive_group(required=True)
destination.add_argument('--output',help='One hero GLB, useful for clip diagnostics.')
destination.add_argument('--package-dir',help='All three runtime LODs and an updated manifest, derived from the edited hero.')
p.add_argument('--manifest',default=str(ROOT/'public/models/gsp/manifest.json'));p.add_argument('--clips',default='')
opt=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source_path=Path(opt.source).resolve()
package=Path(opt.package_dir).resolve() if opt.package_dir else None
assert not (package and opt.clips),'A runtime package must contain the complete animation contract.'
out=package/'gsp-liver-white-lod0.glb' if package else Path(opt.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(source_path.read_bytes()).hexdigest()
assert out.suffix.lower()=='.glb','Output must be GLB; this tool never saves the input blend.'
manifest=json.loads(Path(opt.manifest).read_text());specs=manifest['animations'];names=[s['name'] for s in specs]
if opt.clips:
 wanted=opt.clips.split(',');assert set(wanted)<=set(names),'Unknown clip';specs=[s for s in specs if s['name'] in wanted];names=[s['name'] for s in specs]
bpy.ops.wm.open_mainfile(filepath=str(source_path));bpy.ops.preferences.addon_enable(module='rigify')
scene=bpy.context.scene;scene.render.fps=30
source=bpy.data.objects['GSP_Rig'];controls=bpy.data.objects.get('GSP_Rigify_Controls')
expected_bones={b.name for b in source.data.bones};assert len(expected_bones)==39,'Expected the game 39-bone skeleton.'
for obj in [source,controls]:
 if obj and obj.animation_data:
  for track in obj.animation_data.nla_tracks:track.mute=True
# Copy skin + contract. It follows evaluated authoring output while sampling,
# then has only baked local transforms: no constraints or Rigify nodes at runtime.
bake=source.copy();bake.data=source.data.copy();bake.name='GSP_Export';bpy.context.collection.objects.link(bake);bake.animation_data_clear()
for pose in bake.pose.bones:
 for constraint in list(pose.constraints):pose.constraints.remove(constraint)
mesh=bpy.data.objects['GSP_LiverWhite_LOD0'];exportmesh=mesh.copy();exportmesh.data=mesh.data.copy();exportmesh.name='GSP_LiverWhite_LOD0_Export';bpy.context.collection.objects.link(exportmesh);exportmesh.parent=bake
for modifier in exportmesh.modifiers:
 if modifier.type=='ARMATURE':modifier.object=bake
game_groups={group.index for group in mesh.vertex_groups if group.name in expected_bones}
maximum_influences=max(sum(group.group in game_groups and group.weight>1e-8 for group in vertex.groups) for vertex in mesh.data.vertices)
assert maximum_influences<=4,'Hero has more than four skin influences. Limit and normalize weights in the authoring source, then review deformation before export; do not let GLB silently change the skin.'
report={'source':str(source_path),'sourceSHA256':source_hash,'scope':'Complete runtime package; LOD1/2 simplified from edited hero.' if package else 'Hero mesh diagnostic.','clips':[]};baked=[]
def vertices(obj):
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();points=[(evaluated.matrix_world@v.co).copy() for v in mesh.vertices];evaluated.to_mesh_clear();return points
for spec in specs:
 name=spec['name'];controller=bpy.data.actions.get('CTRL_'+name) if controls else None;action=controller or bpy.data.actions.get(name)
 assert action is not None,'Missing expected action '+name
 if controls:controls['authoring']=bool(controller)
 if controller:
  controls.animation_data_create();controls.animation_data.action=controller;source.animation_data.action=None
 else:source.animation_data.action=action
 start,end=map(lambda value:round(value),action.frame_range)
 assert end>start,'Clip needs a real frame range: '+name
 assert abs((end-start)/30-spec['duration'])<=1/30+.00001,'Controller timing changed; update animation/contact metadata deliberately before export: '+name
 for pose in bake.pose.bones:
  pose.matrix_basis=Matrix.Identity(4)
  constraint=pose.constraints.new('COPY_TRANSFORMS');constraint.target=source;constraint.subtarget=pose.name;constraint.owner_space='WORLD';constraint.target_space='WORLD'
 bpy.ops.object.select_all(action='DESELECT');bake.select_set(True);bpy.context.view_layer.objects.active=bake
 bpy.ops.object.mode_set(mode='POSE')
 bpy.ops.nla.bake(frame_start=start,frame_end=end,step=1,only_selected=False,visual_keying=True,clear_constraints=True,clear_parents=False,use_current_action=False,bake_types={'POSE'})
 bpy.ops.object.mode_set(mode='OBJECT');result=bake.animation_data.action;result.name='EXPORT_'+name;result.use_fake_user=True;baked.append((name,result))
 max_vertex_error=0.;max_matrix_error=0.
 for frame in sorted(set([start,end,*range(start,end+1,5)])):
  scene.frame_set(frame);bpy.context.view_layer.update()
  max_matrix_error=max(max_matrix_error,max(abs(v) for n in expected_bones for row in (source.pose.bones[n].matrix-bake.pose.bones[n].matrix) for v in row))
  a,b=vertices(mesh),vertices(exportmesh);assert len(a)==len(b)
  max_vertex_error=max(max_vertex_error,max((x-y).length for x,y in zip(a,b)))
 assert max_vertex_error<.0001,'Bake changed evaluated skin beyond0.1mm: '+name+' '+str(max_vertex_error)
 report['clips'].append({'name':name,'origin':'Rigify controller action' if controller else 'legacy direct game-bone action','sourceAction':action.name,'frameRange':[start,end],'maximumVertexError':max_vertex_error,'maximumMatrixComponentError':max_matrix_error})
# Remove non-export data only in this disposable Blender process. The artist's
# input file is never saved. This makes the action whitelist unambiguous.
bpy.context.view_layer.objects.active=bake
for obj in list(bpy.data.objects):
 if obj not in [bake,exportmesh]:bpy.data.objects.remove(obj,do_unlink=True)
keep={action for _,action in baked}
for action in list(bpy.data.actions):
 if action not in keep:bpy.data.actions.remove(action,do_unlink=True)
for name,action in baked:action.name=name
bake.name='GSP_Rig';exportmesh.name='GSP_LiverWhite_LOD0';bake.animation_data.action=baked[0][1]
exports=[]
for lod,ratio in ([(0,1),(1,.42),(2,.18)] if package else [(0,1)]):
 mesh=exportmesh
 if lod:
  mesh=exportmesh.copy();mesh.data=exportmesh.data.copy();mesh.name=f'GSP_LiverWhite_LOD{lod}';bpy.context.collection.objects.link(mesh)
  bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
  modifier=mesh.modifiers.new('Distance simplification of edited hero','DECIMATE');modifier.ratio=ratio
  # Reduce the unposed mesh. The armature still evaluates after reduction.
  while mesh.modifiers.find(modifier.name)>0:bpy.ops.object.modifier_move_up(modifier=modifier.name)
  bpy.ops.object.modifier_apply(modifier=modifier.name)
  # A collapsed vertex may inherit more groups than either endpoint. Make the
  # runtime's four-influence reduction explicit on this disposable LOD mesh.
  bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
  bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
 path=package/f'gsp-liver-white-lod{lod}.glb' if package else out
 bpy.ops.object.select_all(action='DESELECT');bake.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=bake
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False,export_anim_slide_to_zero=True,export_anim_single_armature=True,export_force_sampling=True,export_def_bones=False,export_skins=True,export_all_influences=False,export_optimize_animation_size=True,export_materials='EXPORT',export_image_format='AUTO',export_extras=True)
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);actual={a['name'] for a in gltf.get('animations',[])}
 assert actual==set(names),'Exported action whitelist mismatch: '+str(actual)
 assert {n.get('name') for n in gltf['nodes']}>=expected_bones
 assert len(gltf.get('skins',[]))==1 and len(gltf['skins'][0]['joints'])==39
 assert not any(n.get('name','').startswith(('ORG-','MCH-','DEF-','GSP_OUT_')) for n in gltf['nodes'])
 mesh.data.calc_loop_triangles()
 triangles=sum(gltf['accessors'][primitive['indices']]['count']//3 for m in gltf['meshes'] for primitive in m['primitives'])
 exports.append({'lod':lod,'file':path.name,'vertices':len(mesh.data.vertices),'triangles':triangles,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'animations':sorted(actual),'skinJointCounts':[39],'controlNodes':0})
 if lod:bpy.data.objects.remove(mesh,do_unlink=True)
report['exports']=exports
report['export']=exports[0]
report['sourceFileUnchanged']=hashlib.sha256(source_path.read_bytes()).hexdigest()==source_hash
assert report['sourceFileUnchanged'],'Input file changed while exporting.'
if package:
 updated=deepcopy(manifest)
 updated['lods']=[{key:entry[key] for key in ('lod','file','vertices','triangles','bytes','sha256')} for entry in exports]
 updated['authoringExport']={'sourceFile':source_path.name,'sourceSHA256':source_hash,'report':'rigify-export.json','lodDerivation':'LOD1/2 simplified from the edited hero; review silhouettes and deformation before promotion.'}
 (package/'manifest.json').write_text(json.dumps(updated,indent=2)+'\n')
 (package/'rigify-export.json').write_text(json.dumps(report,indent=2)+'\n')
else:out.with_suffix('.export.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
