"""Run inside Blender against saved source: sample contact drift and mesh bounds.
This is authored-flat-ground evidence. Runtime slope IK and game transitions need
separate browser validation; the script does not convert those gaps into passes.
"""
import bpy,json,math,argparse,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--source-file',type=Path,default=ROOT/'assets/source/gsp/gsp-liver-white.blend')
parser.add_argument('--manifest-file',type=Path,default=ROOT/'public/models/gsp/manifest.json')
parser.add_argument('--output',type=Path,default=ROOT/'assets/source/gsp/deformation-report.json')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(args.source_file))
manifest=json.loads(args.manifest_file.read_text())
rig=bpy.data.objects['GSP_Rig'];body=bpy.data.objects['GSP_LiverWhite_LOD0'];scene=bpy.context.scene
skin={'maximumInfluences':max(len(v.groups) for v in body.data.vertices),'maximumWeightSumError':max(abs(sum(g.weight for g in v.groups)-1) for v in body.data.vertices)}
assert skin['maximumInfluences']<=4,'Source preview must use the runtime four-weight limit'
assert skin['maximumWeightSumError']<1e-5,'Source skin weights must be normalized'
reports=[]
for spec in manifest['animations']:
    action=bpy.data.actions[spec['name']];rig.animation_data.action=action
    count=round(spec['duration']*scene.render.fps)
    stance_runs={k:[] for k in ('FL','FR','HL','HR')};active_runs={k:[] for k in stance_runs}
    minz=999;maxz=-999;contact_min=999;contact_max=-999;mouth_min=999;mouth_max=-999
    for frame in range(count+1):
        scene.frame_set(frame);bpy.context.view_layer.update();t=frame/scene.render.fps
        evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
        for vertex in mesh.vertices:
            z=(evaluated.matrix_world@vertex.co).z;minz=min(minz,z);maxz=max(maxz,z)
        evaluated.to_mesh_clear()
        mouth=(rig.matrix_world@rig.pose.bones['MouthSocket'].head).z
        mouth_min=min(mouth_min,mouth);mouth_max=max(mouth_max,mouth)
        for key in stance_runs:
            contact=spec['contacts'][key];phase=((frame/max(1,count))+contact['offset'])%1
            supporting=phase<contact['stanceFraction']
            if spec['name']=='point' and key=='FL':supporting=False
            bone_name=('FrontContact.' if key[0]=='F' else 'HindContact.')+key[1]
            p=rig.matrix_world@rig.pose.bones[bone_name].head
            if supporting:
                active_runs[key].append((-p.y+spec['nominalSpeed']*t,p.z))
                contact_min=min(contact_min,p.z);contact_max=max(contact_max,p.z)
            elif active_runs[key]:stance_runs[key].append(active_runs[key]);active_runs[key]=[]
    for key in stance_runs:
        if active_runs[key]:stance_runs[key].append(active_runs[key])
    drifts={key:max((max(p[0] for p in run)-min(p[0] for p in run) for run in runs if len(run)>1),default=0) for key,runs in stance_runs.items()}
    reports.append({'clip':spec['name'],'minimumMeshHeight':round(minz,5),'maximumMeshHeight':round(maxz,5),'contactMinimumHeight':round(contact_min,5),'contactMaximumHeight':round(contact_max,5),'mouthMinimumHeight':round(mouth_min,5),'mouthMaximumHeight':round(mouth_max,5),'maximumStanceDriftMetres':{k:round(val,5) for k,val in drifts.items()}})
report={'source':str(args.source_file),'sourceSha256':hashlib.sha256(args.source_file.read_bytes()).hexdigest(),'authoredSkin':skin,'scope':'Blender authored clips, flat ground, nominal gait speed. Continuous motion; no runtime IK. Root translation is added only to calculate contact drift.','clips':reports}
args.output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
violations=[r['clip'] for r in reports if r['minimumMeshHeight']<-.003]
assert not violations, f'Authored mesh penetrates the flat ground in: {violations}'
