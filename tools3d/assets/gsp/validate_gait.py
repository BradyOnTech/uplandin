"""Verify actual skinned-paw trot pairs and lateral walking footfall sequence."""
import bpy,json,math,argparse,sys,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--source-file',type=Path,default=ROOT/'assets/source/gsp/gsp-liver-white.blend');p.add_argument('--output',type=Path,default=ROOT/'assets/source/gsp/gait-report.json');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(args.source_file))
scene=bpy.context.scene;rig=bpy.data.objects['GSP_Rig'];body=bpy.data.objects['GSP_LiverWhite_LOD0'];clip=bpy.data.actions['trot']
# Anatomical left is the source's positive lateral X. Select physical paw mesh
# regions before deformation, independently of their vertex-group/bone names.
indices={}
for key in ('FL','FR','HL','HR'):
    sign=1 if key[1]=='L' else -1;front=key[0]=='F'
    indices[key]=[v.index for v in body.data.vertices if v.co.z<.037 and v.co.x*sign>.02 and (-v.co.y>.05 if front else -v.co.y<-.4)]
    assert len(indices[key])>8,(key,len(indices[key]))
rig.animation_data.action=clip
end=round(clip.frame_range[1]);rows=[]
for frame in range(end+1):
    scene.frame_set(frame);bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();row={'frame':frame,'seconds':frame/scene.render.fps,'contacts':{},'physicalPaws':{}}
    for key,ids in indices.items():
        n=('FrontContact.' if key[0]=='F' else 'HindContact.')+key[1]
        pp=rig.pose.bones[n].head
        row['contacts'][key]={'x':pp.x,'forward':-pp.y,'height':pp.z}
        pp=sum((evaluated.matrix_world@mesh.vertices[i].co for i in ids),Vector())/len(ids)
        row['physicalPaws'][key]={'x':pp.x,'forward':-pp.y,'height':pp.z}
        assert pp.x*(1 if key[1]=='L' else -1)>.02,'Physical paw crossed/mismatched its named anatomical side'
    evaluated.to_mesh_clear();rows.append(row)
def correlation(a,b):
    aa=sum(a)/len(a);bb=sum(b)/len(b);num=sum((x-aa)*(y-bb) for x,y in zip(a,b));den=math.sqrt(sum((x-aa)**2 for x in a)*sum((y-bb)**2 for y in b));return num/den
pairs={}
for a,b in [('FL','HR'),('FR','HL'),('FL','HL'),('FR','HR')]:
    pairs[a+'_'+b]={kind:correlation([r[kind][a]['forward'] for r in rows],[r[kind][b]['forward'] for r in rows]) for kind in ('contacts','physicalPaws')}
assert all(pairs[key]['physicalPaws']>.995 for key in ('FL_HR','FR_HL')),'Actual skin does not follow diagonal trot'
assert all(pairs[key]['physicalPaws']<-.6 for key in ('FL_HL','FR_HR')),'Same-side legs are not opposed'
means={k:sum(r['physicalPaws'][k]['forward'] for r in rows)/len(rows) for k in indices}
for row in rows:
    row['reachRelativeToCycleMean']={k:row['physicalPaws'][k]['forward']-means[k] for k in indices}
walking={}
for name in ('walk','carry','heel','locate','stalk','turn_left','turn_right'):
    clip=bpy.data.actions[name];rig.animation_data.action=clip;end=float(clip.frame_range[1]);samples=[]
    for sample in range(120):
        phase=sample/120;frame=end*phase;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();row={'phase':phase,'contacts':{},'physicalPaws':{}}
        for key,ids in indices.items():
            bone=('FrontContact.' if key[0]=='F' else 'HindContact.')+key[1];contact=rig.pose.bones[bone].head
            paw=sum((evaluated.matrix_world@mesh.vertices[i].co for i in ids),Vector())/len(ids)
            row['contacts'][key]={'x':contact.x,'forward':-contact.y,'height':contact.z}
            row['physicalPaws'][key]={'x':paw.x,'forward':-paw.y,'height':paw.z}
            assert paw.x*(1 if key[1]=='L' else -1)>.02,(name,key,'Physical paw crossed anatomical side')
        evaluated.to_mesh_clear();samples.append(row)
    peaks={kind:{key:max(samples,key=lambda r:r[kind][key]['forward'])['phase'] for key in indices} for kind in ('contacts','physicalPaws')}
    orders={kind:sorted(indices,key=lambda key:(phase_map[key]-phase_map['FL'])%1) for kind,phase_map in peaks.items()}
    for kind,order in orders.items():
        assert order==['FL','HR','FR','HL'],(name,kind,'Expected lateral walking sequence, actual',order,peaks[kind])
    walking[name]={'forwardPeakPhases':peaks,'footfallOrderStartingFL':orders,'samples':samples}
report={'source':str(args.source_file),'sourceSha256':hashlib.sha256(args.source_file.read_bytes()).hexdigest(),'clip':'trot','sideDefinition':'Anatomical left = positive source X; independently selected rest-mesh paws, not group names','physicalPawVertexCounts':{k:len(v) for k,v in indices.items()},'correlations':pairs,'samples':rows,'walking':walking,'method':'120 physical-mesh and contact samples per walking cycle; maximum forward reach identifies touchdown order. Trot compares actual trajectories across the full authored cycle.','reference':'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0133936','verdict':'All seven walking clips use lateral sequence (HL -> FL -> HR -> FR cyclically). Trot uses synchronized diagonal pairs. No physical skin-side mirroring found.'}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:({n:{kk:vv for kk,vv in item.items() if kk!='samples'} for n,item in v.items()} if k=='walking' else v) for k,v in report.items() if k!='samples'},indent=2))
