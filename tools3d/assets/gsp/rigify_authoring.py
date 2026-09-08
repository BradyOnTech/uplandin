"""Add an editable Rigify authoring rig to a separate source copy.
Existing direct game-bone actions remain unchanged and playable. Toggle the
controls object's 'authoring' property for new CTRL_<clip> actions.
Run: Blender --background --python rigify_authoring.py -- --source input.blend --output editable.blend
"""
import bpy,json,sys,math,argparse
from pathlib import Path
from mathutils import Vector,Matrix
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
opt=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source_path=Path(opt.source).resolve();output_path=Path(opt.output).resolve()
assert source_path!=output_path,'Use a separate output file; preserve the input source.'
output_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source_path))
bpy.ops.preferences.addon_enable(module='rigify')
from rigify.metarigs.Basic import basic_quadruped
from rigify import generate
scene=bpy.context.scene;original_frame=scene.frame_current
source=bpy.data.objects['GSP_Rig']
assert not bpy.data.objects.get('GSP_Rigify_Controls'),'Input already has Rigify controls.'
source.animation_data_create();original_action=source.animation_data.action;original_basis={p.name:p.matrix_basis.copy() for p in source.pose.bones}
track_mutes=[(t,t.mute) for t in source.animation_data.nla_tracks]
for t,_ in track_mutes:t.mute=True
source.animation_data.action=None
for p in source.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
rest={b.name:{'head':b.head_local.copy(),'tail':b.tail_local.copy(),'matrix':b.matrix_local.copy(),'length':b.length,'parent':b.parent.name if b.parent else None,'deform':b.use_deform} for b in source.data.bones}
bpy.ops.object.select_all(action='DESELECT')
meta=bpy.data.objects.new('GSP_Rigify_Metarig',bpy.data.armatures.new('GSP_Rigify_Metarig'))
bpy.context.collection.objects.link(meta);meta.select_set(True);bpy.context.view_layer.objects.active=meta
basic_quadruped.create(meta)
bpy.ops.object.mode_set(mode='EDIT')
bones=meta.data.edit_bones
for b in bones:
 b.head=Vector((b.head.x*.8,b.head.y*.55,b.head.z*.73));b.tail=Vector((b.tail.x*.8,b.tail.y*.55,b.tail.z*.73))
def fit(name,head,tail):
 b=bones[name];b.head=head;b.tail=tail

def fit_game(name,game):fit(name,rest[game]['head'],rest[game]['tail'])
p=rest['Pelvis'];s=rest['Spine'];c=rest['Chest'];n=rest['Neck'];h=rest['Head']
fit_game('spine.004','Pelvis')
fit('spine.005',s['head'],s['head'].lerp(s['tail'],.5))
fit('spine.006',s['head'].lerp(s['tail'],.5),s['tail'])
fit('spine.007',c['head'],c['head'].lerp(c['tail'],.5))
fit('spine.008',c['head'].lerp(c['tail'],.5),c['tail'])
fit('spine.009',n['head'],n['head'].lerp(n['tail'],.5))
fit('spine.010',n['head'].lerp(n['tail'],.5),n['tail'])
fit_game('spine.011','Head')
for name,game in [('spine.003','Tail01'),('spine.002','Tail02'),('spine.001','Tail03')]:fit_game(name,game)
t=rest['Tail03'];fit('spine',t['tail'],t['tail']+(t['tail']-t['head']).normalized()*.03)
for side in ['L','R']:
 for name,game in [('pelvis','Hip'),('thigh','Thigh'),('shin','Shin'),('foot','Hock'),('toe','HindPaw'),('shoulder','Shoulder'),('front_thigh','UpperArm'),('front_shin','Forearm'),('front_foot','Carpus'),('front_toe','FrontPaw')]:fit_game(name+'.'+side,game+'.'+side)
 # Unused breast deformation removed: skin already carries chest weights.
 bones.remove(bones['breast.'+side])
extras={'jaw':('Jaw','spine.011'),'ear.L':('EarBase.L','spine.011'),'ear.R':('EarBase.R','spine.011'),'ear_tip.L':('EarTip.L','ear.L'),'ear_tip.R':('EarTip.R','ear.R')}
for name,(game,parent) in extras.items():
 b=bones.new(name);b.head=rest[game]['head'];b.tail=rest[game]['tail'];b.parent=bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
meta.pose.bones['spine.003'].rigify_parameters.connect_chain=False
for name in extras:
 p=meta.pose.bones[name];p.rigify_type='basic.super_copy';p.rigify_parameters.make_control=True;p.rigify_parameters.make_deform=True
 meta.data.collections['Spine'].assign(p)
for side in ['L','R']:
 for name in ['thigh','front_thigh']:
  p=meta.pose.bones[name+'.'+side];p.rigify_parameters.segments=1
  # Anatomical axes are coplanar sagittally; solver infers bend orientation.
  p.rigify_parameters.rotation_axis='automatic'
meta.show_in_front=True
generate.generate_rig(bpy.context,meta)
controls=bpy.context.object;controls.name='GSP_Rigify_Controls';controls.show_in_front=True
mapping={'Root':'root','Pelvis':'DEF-spine.004','Spine':'DEF-spine.005','Chest':'DEF-spine.007','Neck':'DEF-spine.009','Head':'DEF-spine.011','Jaw':'DEF-jaw','Tail01':'DEF-spine.003','Tail02':'DEF-spine.002','Tail03':'DEF-spine.001','MouthSocket':'DEF-jaw'}
for side in ['L','R']:
 for game,target in [('Shoulder','shoulder'),('UpperArm','front_thigh'),('Forearm','front_shin'),('Carpus','front_foot'),('FrontPaw','front_toe'),('FrontContact','front_toe'),('Hip','pelvis'),('Thigh','thigh'),('Shin','shin'),('Hock','foot'),('HindPaw','toe'),('HindContact','toe'),('EarBase','ear'),('EarTip','ear_tip')]:mapping[game+'.'+side]='DEF-'+target+'.'+side
controls['authoring']=True
controls.id_properties_ui('authoring').update(description='Off: play existing direct game-bone clips. On: animate Rigify controllers and bake CTRL_<clip> replacements.')
bpy.ops.object.select_all(action='DESELECT');controls.select_set(True);bpy.context.view_layer.objects.active=controls
bpy.ops.object.mode_set(mode='EDIT')
for name,spec in rest.items():
 b=controls.data.edit_bones.new('GSP_OUT_'+name);b.head=spec['head'];b.tail=spec['tail'];b.matrix=spec['matrix'];b.length=spec['length'];b.parent=controls.data.edit_bones[mapping[name]];b.use_deform=False;b.inherit_scale='NONE'
bpy.ops.object.mode_set(mode='OBJECT')
bridgecoll=controls.data.collections.new('Game export bridge');bridgecoll.is_visible=False
for name in rest:
 p=controls.pose.bones['GSP_OUT_'+name]
 for c in list(p.bone.collections):c.unassign(p)
 bridgecoll.assign(p)
 c=source.pose.bones[name].constraints.new('COPY_TRANSFORMS');c.name='Rigify output';c.target=controls;c.subtarget=p.name;c.owner_space='WORLD';c.target_space='WORLD'
 driver=c.driver_add('influence').driver;driver.type='SCRIPTED';driver.expression='authoring'
 var=driver.variables.new();var.name='authoring';var.type='SINGLE_PROP';var.targets[0].id=controls;var.targets[0].data_path='[\"authoring\"]'
for side in ['L','R']:
 for name in ['thigh_parent.','front_thigh_parent.']:controls.pose.bones[name+side]['IK_Stretch']=0.0
bpy.context.view_layer.update()
neutralerrors={name:(source.pose.bones[name].head-r['head']).length for name,r in rest.items()}

assert max(neutralerrors.values())<.00001,'Neutral bridge head mismatch'
assert max(abs(v) for p in source.pose.bones for row in (p.matrix-p.bone.matrix_local) for v in row)<.0001,'Neutral bridge matrix mismatch'
controls['authoring']=False
controls['action_convention']='CTRL_<runtime clip name>; optional replacements, not converted legacy animations.'
source.animation_data.action=original_action
for t,mute in track_mutes:t.mute=mute
for p in source.pose.bones:p.matrix_basis=original_basis[p.name]
scene.frame_set(original_frame);bpy.context.view_layer.update()
meta.hide_set(True);meta.hide_render=True;source.show_in_front=False
bpy.context.view_layer.objects.active=controls
bpy.ops.object.select_all(action='DESELECT');controls.select_set(True)
report={'source':str(source_path),'output':str(output_path),'gameBones':len(source.data.bones),'rigifyBones':len(controls.data.bones),'controlShapes':sum(bool(p.custom_shape) for p in controls.pose.bones),'mode':'Legacy clip playback by default; opt-in controller authoring','mapping':mapping}
output_path.with_suffix('.rigify.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
print(json.dumps(report))
