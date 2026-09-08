"""Author and export the Uplandin GSP. Run with Blender, not system Python.

The mesh is deliberately authored from anatomical section loops, connected limb
openings, thin ear ribbons, and four bounded skin influences. No generated mesh
is decimated to create the hero. See docs/3d/gsp-asset.md for the runtime contract.
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/models/gsp'
SOURCE = ROOT / 'assets/source/gsp'
RENDERS = ROOT / 'docs/3d/gsp-renders'
for path in (OUT, SOURCE, RENDERS): path.mkdir(parents=True, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
parser.add_argument('--animation-frames', action='store_true')
parser.add_argument('--no-export', action='store_true')
parser.add_argument('--quick',action='store_true',help='With preview, render only trot plus neutral clay diagnostic')
parser.add_argument('--preview', action='store_true', help='Write candidate source and three static views to /tmp only')
opt = parser.parse_args(ARGS)
if opt.preview:
    SOURCE=Path('/tmp/uplandin-gsp-anatomy-candidate'); RENDERS=SOURCE/'renders'
    SOURCE.mkdir(parents=True,exist_ok=True); RENDERS.mkdir(parents=True,exist_ok=True)
    opt.no_export=True
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection': bpy.data.collections.remove(collection)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.render.fps = 30
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# Anatomical coordinates: x = lateral, f = forward, z = height.
# Blender -Y forward converts to Three.js +Z through the GLTF Y-up export.
def v(x, f, z): return Vector((x, -f, z))
def vec(a): return v(*a)

# Source-guided retopology: retain broad anatomical planes by ray-projecting
# deliberately placed loops onto the preserved source, rather than decimating it.
# The reference is aligned once and removed from the editable/runtime scene.
original_images=set(bpy.data.images)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'GSP-liver-white.glb'))
source_ob=next(o for o in bpy.context.selected_objects if o.type=='MESH')
for vertex in source_ob.data.vertices:
    pos=source_ob.matrix_world@vertex.co
    vertex.co=(pos.y*1.19,pos.x*1.19+.025,pos.z*1.19)
source_ob.matrix_world.identity()
bpy.context.view_layer.update()
source_bvh=BVHTree.FromObject(source_ob,bpy.context.evaluated_depsgraph_get())
# A bounded, symmetric ray uses the clearer left side of the supplied model.
# This recovers its anatomy without copying asymmetrical generated poses.
def project_source(origin,direction,fallback,max_distance=.32):
    mirrored=origin.x>0 or (abs(origin.x)<1e-8 and direction.x>0)
    oo=origin.copy();dd=direction.copy()
    if mirrored:oo.x=-oo.x;dd.x=-dd.x
    hit,normal,index,distance=source_bvh.ray_cast(oo,dd.normalized(),max_distance)
    if hit is None:return fallback
    if mirrored:hit.x=-hit.x
    return hit
source_ob.name='REFERENCE source for selected-to-active albedo bake'
source_ob.hide_render=True

BONES = {}
def bone(name, head, tail, parent=None, deform=True):
    BONES[name] = dict(head=vec(head), tail=vec(tail), parent=parent, deform=deform)
bone('Root',(0,0,0),(0,0,.12))
bone('Pelvis',(0,-.35,.53),(0,-.14,.54),'Root')
bone('Spine',(0,-.14,.54),(0,.055,.535),'Pelvis')
bone('Chest',(0,.055,.535),(0,.21,.60),'Spine')
bone('Neck',(0,.21,.60),(0,.36,.705),'Chest')
bone('Head',(0,.36,.705),(0,.465,.742),'Neck')
bone('Jaw',(0,.435,.687),(0,.589,.687),'Head')
bone('Tail01',(0,-.425,.608),(0,-.459,.691),'Pelvis')
bone('Tail02',(0,-.459,.691),(0,-.472,.765),'Tail01')
bone('Tail03',(0,-.472,.765),(0,-.47,.795),'Tail02')
for side,sgn in [('L',1),('R',-1)]:
    bone('Shoulder.'+side,(sgn*.072,.08,.61),(sgn*.068,.222,.468),'Chest')
    bone('UpperArm.'+side,(sgn*.068,.222,.468),(sgn*.066,.153,.315),'Shoulder.'+side)
    bone('Forearm.'+side,(sgn*.066,.153,.315),(sgn*.062,.166,.095),'UpperArm.'+side)
    bone('Carpus.'+side,(sgn*.062,.166,.095),(sgn*.064,.174,.042),'Forearm.'+side)
    bone('FrontPaw.'+side,(sgn*.064,.174,.042),(sgn*.064,.227,.022),'Carpus.'+side)
    bone('FrontContact.'+side,(sgn*.064,.199,.009),(sgn*.064,.229,.009),'FrontPaw.'+side,False)
    bone('Hip.'+side,(sgn*.068,-.365,.554),(sgn*.073,-.365,.525),'Pelvis')
    bone('Thigh.'+side,(sgn*.073,-.365,.525),(sgn*.072,-.33,.345),'Hip.'+side)
    bone('Shin.'+side,(sgn*.072,-.33,.345),(sgn*.065,-.531,.128),'Thigh.'+side)
    bone('Hock.'+side,(sgn*.065,-.531,.128),(sgn*.065,-.551,.039),'Shin.'+side)
    bone('HindPaw.'+side,(sgn*.065,-.551,.039),(sgn*.065,-.513,.023),'Hock.'+side)
    bone('HindContact.'+side,(sgn*.065,-.540,.009),(sgn*.065,-.510,.009),'HindPaw.'+side,False)
    bone('EarBase.'+side,(sgn*.064,.411,.777),(sgn*.09,.377,.69),'Head')
    bone('EarTip.'+side,(sgn*.09,.377,.69),(sgn*.083,.373,.603),'EarBase.'+side)
bone('MouthSocket',(0,.568,.684),(0,.615,.684),'Jaw',False)
arm_data=bpy.data.armatures.new('GSP_Skeleton')
rig=bpy.data.objects.new('GSP_Rig',arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,b in BONES.items():
    eb=arm_data.edit_bones.new(name); eb.head=b['head']; eb.tail=b['tail']; eb.use_deform=b['deform']
    if b['parent']: eb.parent=arm_data.edit_bones[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT'); rig.show_in_front=True
rig['source_reference']='GSP-liver-white.glb; source-conforming retopology and coat sampling; source preserved unchanged'
rig['units']='metres; -Y forward / Z up; GLTF +Z forward / Y up'

verts=[]; faces=[]; weights=[]; zones=[]
def vert(pos,w,zone='coat'):
    verts.append(tuple(pos)); weights.append(w); zones.append(zone); return len(verts)-1

def bridge(a,b):
    assert len(a)==len(b)
    for i in range(len(a)):
        j=(i+1)%len(a); faces.append((a[i],a[j],b[j],b[i]))

def cap(loop,w,zone='coat'):
    p=sum((Vector(verts[i]) for i in loop),Vector())/len(loop)
    idx=vert(p,w,zone)
    for i in range(len(loop)): faces.append((loop[i],loop[(i+1)%len(loop)],idx))

def blend(a,b,t): return {a:1-t,b:t}

# Ring-to-ring skin continuity, with dedicated openings for shoulders and hips.
# f, centre height, half-width, upper depth, lower depth, skeletal influence
# Centres are taken from source orthographic cross-sections. The ring radius
# values are fallbacks only; bounded inside-out projection samples the anatomy.
sections=[
(-.433,.56,.02,.05,.06,{'Pelvis':1}),
(-.417,.547,.055,.073,.09,{'Pelvis':1}),
(-.39,.529,.085,.093,.095,{'Pelvis':1}),
(-.355,.522,.096,.095,.09,{'Pelvis':1}),
(-.315,.526,.10,.098,.096,{'Pelvis':1}),
(-.27,.531,.092,.098,.085,blend('Pelvis','Spine',.15)),
(-.22,.535,.085,.098,.095,blend('Pelvis','Spine',.45)),
(-.17,.531,.081,.10,.097,blend('Pelvis','Spine',.8)),
(-.12,.525,.086,.108,.10,{'Spine':1}),
(-.07,.515,.092,.115,.12,{'Spine':1}),
(-.02,.493,.10,.126,.13,blend('Spine','Chest',.15)),
(.03,.485,.10,.14,.142,blend('Spine','Chest',.45)),
(.08,.485,.10,.142,.145,blend('Spine','Chest',.8)),
(.13,.485,.10,.145,.145,{'Chest':1}),
(.18,.497,.092,.152,.145,{'Chest':1}),
(.225,.528,.085,.144,.148,blend('Chest','Neck',.05)),
(.265,.57,.082,.135,.14,blend('Chest','Neck',.25)),
(.30,.623,.074,.116,.11,blend('Chest','Neck',.65)),
(.33,.656,.072,.112,.108,{'Neck':1}),
(.355,.689,.071,.098,.11,blend('Neck','Head',.2)),
(.38,.710,.072,.088,.11,blend('Neck','Head',.55)),
(.405,.723,.075,.078,.09,blend('Neck','Head',.85)),
(.43,.728,.074,.073,.087,{'Head':1}),
(.455,.727,.071,.07,.073,{'Head':1}),
(.478,.721,.068,.063,.065,{'Head':1}),
(.495,.715,.064,.062,.055,{'Head':1}),
(.51,.708,.060,.060,.053,{'Head':1}),
(.53,.705,.056,.053,.048,{'Head':1}),
(.552,.704,.053,.052,.047,{'Head':1}),
(.575,.705,.048,.044,.044,{'Head':1}),
(.592,.709,.043,.035,.031,{'Head':1}),
(.605,.713,.033,.024,.025,{'Head':1}),
(.614,.714,.015,.014,.016,{'Head':1}),
]
N=20; rings=[]
for f,z,rx,upper,lower,w in sections:
    loop=[]
    for j in range(N):
        a=2*pi*j/N
        fallback=v(cos(a)*rx,f,z+sin(a)*(upper if sin(a)>=0 else lower))
        pos=project_source(v(0,f,z),Vector((cos(a),0,sin(a))),fallback)
        if f<-.405:pos.z=min(pos.z,.626)
        # Remove generated male anatomy and keep an athletic abdominal tuck.
        if -.29<f<-.16 and sin(a)<-.45:
            pos.z=max(pos.z,.429+(.29+f)*.04)
        ww=dict(w)
        if .075<f<.23 and abs(pos.x)>.045 and pos.z<.515:
            side='L' if pos.x>0 else 'R'
            factor=min(.5,max(0,(.535-pos.z)*2.8))
            ww={name:value*(1-factor) for name,value in ww.items()};ww['Shoulder.'+side]=factor
        elif -.405<f<-.30 and abs(pos.x)>.04 and pos.z<.54:
            side='L' if pos.x>0 else 'R';factor=min(.5,max(0,(.555-pos.z)*3))
            ww={name:value*(1-factor) for name,value in ww.items()};ww['Hip.'+side]=factor
        loop.append(vert(pos,ww))
    rings.append(loop)
# Split the existing muzzle surface at its anatomical lip line. Upper muzzle
# stays with Head and the lower mandible follows Jaw; no overlapping jaw primitive.
jaw_rings={}
for ri,(ff,zz,rx,up,low,w) in enumerate(sections):
    if ff<.455:continue
    amount=min(1,max(0,(ff-.43)/.06))
    jaw_loop=list(rings[ri])
    for j in range(11,20):
        idx=rings[ri][j]
        if j in (11,19):jaw_loop[j]=vert(Vector(verts[idx]),blend('Head','Jaw',amount))
        else:weights[idx]=blend('Head','Jaw',amount)
    jaw_rings[ri]=jaw_loop
holes=[]
for st in (2,12):
    for side,sgn,k in [('L',1,16),('R',-1,12)]:
        holes.append((st,k,side,'hind' if st==2 else 'front'))
for i in range(len(rings)-1):
    for j in range(N):
        if any(i in (st,st+1) and j in (k,k+1) for st,k,_,_ in holes) or (i in (0,1) and j in (4,5)): continue
        aa=jaw_rings.get(i,rings[i]) if 11<=j<19 else rings[i]
        bb=jaw_rings.get(i+1,rings[i+1]) if 11<=j<19 else rings[i+1]
        faces.append((aa[j],aa[(j+1)%N],bb[(j+1)%N],bb[j]))
cap(rings[0],{'Pelvis':1})
cap([rings[-1][j] for j in [19,0,1,2,3,4,5,6,7,8,9,10,11]],{'Head':1})
cap([jaw_rings[len(rings)-1][j] for j in range(11,20)],{'Jaw':1})
# Separate mouth roof and floor create a dark true opening in pickup/carry.
for i in range(len(rings)-1):
    if i not in jaw_rings or i+1 not in jaw_rings:continue
    faces.append((rings[i][11],rings[i][19],rings[i+1][19],rings[i+1][11]))
    aa=jaw_rings[i];bb=jaw_rings[i+1]
    faces.append((aa[19],aa[11],bb[11],bb[19]))


# Continuous limb loops around the main joints. Correspondences are determined at the
# opening then retained to the toes; added loops surround every moving joint.
for st,k,side,kind in holes:
    sgn=1 if side=='L' else -1
    opening=[rings[st][k],rings[st][k+1],rings[st][k+2],rings[st+1][k+2],rings[st+2][k+2],rings[st+2][k+1],rings[st+2][k],rings[st+1][k]]
    loop_count=len(opening)
    center=sum((Vector(verts[i]) for i in opening),Vector())/loop_count
    angles=[math.atan2(-(verts[i][1]-center.y),verts[i][0]-center.x) for i in opening]
    winding=sum(math.atan2(sin(angles[(j+1)%loop_count]-angles[j]),cos(angles[(j+1)%loop_count]-angles[j])) for j in range(loop_count))
    angles=[angles[0]+(1 if winding>0 else -1)*2*pi*j/loop_count for j in range(loop_count)]
    if kind=='front':
        S,U,F,C,P=[n+'.'+side for n in ('Shoulder','UpperArm','Forearm','Carpus','FrontPaw')]
        loopdata=[
          (.067,.153,.333,.027,.045,blend(S,U,.85)),
          (.066,.153,.316,.027,.043,blend(U,F,.25)),
          (.065,.153,.296,.026,.040,blend(U,F,.75)),
          (.063,.155,.26,.023,.033,{F:1}),
          (.061,.158,.22,.021,.029,{F:1}),
          (.06,.161,.177,.019,.026,{F:1}),
          (.059,.162,.133,.018,.025,{F:1}),
          (.062,.166,.104,.019,.025,blend(F,C,.2)),
          (.062,.169,.087,.020,.026,blend(F,C,.65)),
          (.062,.172,.063,.018,.025,blend(C,P,.1)),
          (.064,.177,.041,.026,.032,blend(C,P,.7)),
          (.064,.198,.024,.032,.041,{P:1}),
          (.064,.198,.009,.031,.040,{P:1}),
          (.064,.198,.003,.027,.038,{P:1}),
        ]
    else:
        H,T,S,C,P=[n+'.'+side for n in ('Hip','Thigh','Shin','Hock','HindPaw')]
        loopdata=[
          (.075,-.366,.390,.029,.068,blend(H,T,.75)),
          (.071,-.371,.355,.029,.064,blend(T,S,.25)),
          (.070,-.394,.319,.029,.06,blend(T,S,.65)),
          (.072,-.425,.281,.027,.055,{S:1}),
          (.071,-.45,.245,.025,.05,{S:1}),
          (.065,-.485,.208,.023,.040,{S:1}),
          (.064,-.516,.17,.024,.035,{S:1}),
          (.065,-.531,.138,.021,.033,blend(S,C,.2)),
          (.065,-.541,.119,.020,.029,blend(S,C,.6)),
          (.065,-.550,.093,.019,.028,{C:1}),
          (.065,-.555,.068,.020,.025,blend(C,P,.2)),
          (.065,-.552,.039,.026,.03,blend(C,P,.65)),
          (.065,-.547,.022,.032,.037,{P:1}),
          (.065,-.545,.009,.032,.036,{P:1}),
          (.065,-.545,.003,.028,.033,{P:1}),
        ]
    prev=opening
    for x,f,z,rx,rf,w in loopdata:
        loop=[]
        for a in angles:
            fallback=v(sgn*x+cos(a)*rx,f+sin(a)*rf,z)
            projected=project_source(v(sgn*x,f,z),Vector((cos(a),-sin(a),0)),fallback,.15)
            # Foot-floor samples are authored to a common sole plane.
            if z<.006:projected=fallback
            loop.append(vert(projected,w))
        bridge(prev,loop); prev=loop
    cap(prev,{P:1})

# Thin, curled ear leather with a clean rounded triangular silhouette.
for side,sgn in [('L',1),('R',-1)]:
    E='EarBase.'+side; T='EarTip.'+side
    earrows=[(.411,.777,.058,.011),(.409,.761,.066,.027),(.400,.735,.072,.046),(.378,.699,.074,.054),(.367,.655,.076,.049),(.370,.625,.074,.035),(.383,.609,.069,.018),(.39,.608,.066,.005)]
    front=[];back=[]
    for i,(f,z,x,rf) in enumerate(earrows):
        w=blend(E,T,max(0,min(1,(i-1)/3)))
        aa=[]; bb=[]
        for j in range(5):
            t=-1+j/2; xx=x+.003*(1-t*t)-.012*t; ff=f+t*rf; zz=z+.005*t*t
            aa.append(vert(v(sgn*xx,ff,zz),w,'ear'))
            bb.append(vert(v(sgn*(xx-.004),ff,zz),w,'ear'))
        front.append(aa);back.append(bb)
    for i in range(len(front)-1):
        for j in range(4):
            faces.append((front[i][j],front[i+1][j],front[i+1][j+1],front[i][j+1]))
            faces.append((back[i][j+1],back[i+1][j+1],back[i+1][j],back[i][j]))
        faces.append((front[i][0],back[i][0],back[i+1][0],front[i+1][0]))
        faces.append((front[i+1][-1],back[i+1][-1],back[i][-1],front[i][-1]))
    for i in (0,len(front)-1):
        for j in range(4): faces.append((front[i][j],front[i][j+1],back[i][j+1],back[i][j]))

# The reference's natural tail is grafted into an eight-vertex rump opening;
# shared boundary vertices guarantee deformation continuity at the root.
tail_opening=[rings[0][4],rings[0][5],rings[0][6],rings[1][6],rings[2][6],rings[2][5],rings[2][4],rings[1][4]]
tail_center=sum((Vector(verts[k]) for k in tail_opening),Vector())/8
tail_angles=[math.atan2((-(verts[k][1]-tail_center.y)+(verts[k][2]-tail_center.z))*.7071,verts[k][0]-tail_center.x) for k in tail_opening]
tail_winding=sum(math.atan2(sin(tail_angles[(j+1)%8]-tail_angles[j]),cos(tail_angles[(j+1)%8]-tail_angles[j])) for j in range(8))
tail_angles=[tail_angles[0]+(1 if tail_winding>0 else -1)*2*pi*j/8 for j in range(8)]
for k in tail_opening:zones[k]='tail';weights[k]=blend('Pelvis','Tail01',.12)
prev=tail_opening
for i,(f,z,r) in enumerate([(-.434,.647,.026),(-.452,.675,.022),(-.465,.71,.017),(-.473,.746,.013),(-.470,.778,.011),(-.462,.797,.007),(-.458,.801,.002)]):
    w=blend('Tail01','Tail02',max(0,min(1,(i-2)/2))) if i<5 else blend('Tail02','Tail03',min(1,(i-4)/2))
    if i==0:w=blend('Pelvis','Tail01',.2)
    elif i==1:w=blend('Pelvis','Tail01',.7)
    loop=[vert(v(cos(a)*r,f+sin(a)*r*.70,z+sin(a)*r*.7),w,'tail') for a in tail_angles]
    if prev: bridge(prev,loop)
    else: cap(loop,w)
    prev=loop
cap(prev,{'Tail03':1})

mesh=bpy.data.meshes.new('GSP_AnatomicalCage'); mesh.from_pydata(verts,[],faces); mesh.update()
body=bpy.data.objects.new('GSP_Coat',mesh); bpy.context.collection.objects.link(body)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
# Recalculate the connected surface consistently before subdivision.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
for p in mesh.polygons:p.use_smooth=True
liver_attr=mesh.attributes.new('solid_liver','FLOAT','POINT')
for i,zone in enumerate(zones):liver_attr.data[i].value=1 if zone=='ear' else 0
tail_attr=mesh.attributes.new('tail_surface','FLOAT','POINT')
for i,zone in enumerate(zones):tail_attr.data[i].value=1 if zone=='tail' else 0
# Creased anatomical lip boundaries remain coincident when the neutral jaw is
# closed; subdivision must not pull the two halves apart into black cracks.
lip_edges=set()
for i in range(len(rings)-1):
    if i not in jaw_rings or i+1 not in jaw_rings:continue
    for j in (11,19):
        lip_edges.add(frozenset((rings[i][j],rings[i+1][j])))
        lip_edges.add(frozenset((jaw_rings[i][j],jaw_rings[i+1][j])))
crease=mesh.attributes.new('crease_edge','FLOAT','EDGE')
for edge in mesh.edges:
    if frozenset(edge.vertices) in lip_edges:crease.data[edge.index].value=1

for name in BONES:
    if BONES[name]['deform']:body.vertex_groups.new(name=name)
for i,w in enumerate(weights):
    for name,weight in w.items():
        if weight>0:body.vertex_groups[name].add([i],weight,'REPLACE')
sub=body.modifiers.new('Anatomical surface refinement','SUBSURF');sub.levels=1;sub.render_levels=1
skin=body.modifiers.new('GSP skeletal deformation','ARMATURE');skin.object=rig
body.parent=rig

# Restrained liver-and-ivory color, painted analytically in anatomical space.
# The material is baked to an atlas, so there is no procedural runtime shader.
def principled(name,color,rough=.8):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    return m
ivory=(.62,.601,.546); liver=(.047,.028,.019)
coat=principled('GSP painted liver and ivory',ivory,.82)
body.data.materials.append(coat)
nt=coat.node_tree;nodes=nt.nodes;links=nt.links;bs=nodes.get('Principled BSDF')
# Apply the fixed hero subdivision before UV authoring; armature stays editable.
cage=body.copy();cage.data=body.data.copy();cage.name='GSP_ControlCage';bpy.context.collection.objects.link(cage);cage.hide_render=True;cage.hide_set(True)
for modifier in list(cage.modifiers):cage.modifiers.remove(modifier)
cage.parent=None
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=sub.name)
# A second bounded surface projection after subdivision restores the source's
# broad cheek, scapula, rib and paw planes that subdivision would otherwise round.
for vertex in body.data.vertices:
    if vertex.co.z<.01:continue
    # Preserve the authored ear leather, mouth interior and shortened tail.
    if body.data.attributes['solid_liver'].data[vertex.index].value>.8 or body.data.attributes['tail_surface'].data[vertex.index].value>.8:continue
    pp=vertex.co.copy();mirrored=pp.x>0
    if mirrored:pp.x=-pp.x
    hit,normal,index,distance=source_bvh.find_nearest(pp,.045)
    if hit is not None:
        if mirrored:hit.x=-hit.x
        # Gentle projection on the trunk avoids restoring high-frequency source
        # artifacts while the muzzle/paws need closer anatomical conformity.
        alpha=.92 if -vertex.co.y>.33 or vertex.co.z<.32 else .80
        vertex.co=vertex.co.lerp(hit,alpha)
# Smooth only the graft transition, keeping the sampled torso/limb landmarks.
# This removes doubled-back slivers from projecting a curved opening onto two
# nearby source surfaces at the armpit/groin.
adj=[set() for _ in body.data.vertices]
for edge in body.data.edges:
    a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
blend_factors=[]
for vertex in body.data.vertices:
    pp=vertex.co;ff=-pp.y
    front=((ff-.155)/.095)**2+((pp.z-.354)/.065)**2+((abs(pp.x)-.075)/.065)**2
    hind=((ff+.37)/.115)**2+((pp.z-.42)/.09)**2+((abs(pp.x)-.08)/.07)**2
    blend_factors.append(max(0,1-min(front,hind))*.65)
for iteration in range(12):
    previous=[v.co.copy() for v in body.data.vertices]
    for vertex in body.data.vertices:
        strength=blend_factors[vertex.index]
        if strength and adj[vertex.index]:
            average=sum((previous[k] for k in adj[vertex.index]),Vector())/len(adj[vertex.index])
            vertex.co=previous[vertex.index].lerp(average,strength)
# Hand-directed continuous muscle weights on the refined junctions: upper arm
# and thigh carry the outside muscle while the sternum/belly remain on the trunk.
def smooth01(value):
    value=max(0,min(1,value));return value*value*(3-2*value)
for vertex in body.data.vertices:
    pp=vertex.co;ff=-pp.y;side='L' if pp.x>0 else 'R';new_weights=None
    lateral=smooth01((abs(pp.x)-.006)/.052)
    old={body.vertex_groups[g.group].name:g.weight for g in vertex.groups}
    trunk={name:weight for name,weight in old.items() if name in ('Root','Pelvis','Spine','Chest','Neck','Head')}
    total=sum(trunk.values())
    if total:trunk={name:weight/total for name,weight in trunk.items()}
    if .015<ff<.275 and .285<pp.z<.575:
        region=math.exp(-((ff-.15)/.10)**4)*lateral
        upper=region*(1-smooth01((pp.z-.355)/.145))*.97
        shoulder=region*smooth01((pp.z-.355)/.145)*(1-smooth01((pp.z-.50)/.12))*.72
        new_weights={name:weight*(1-upper-shoulder) for name,weight in (trunk or {'Chest':1}).items()};new_weights.update({'UpperArm.'+side:upper,'Shoulder.'+side:shoulder})
    elif -.465<ff<-.265 and .365<pp.z<.57:
        region=math.exp(-((ff+.36)/.115)**4)*lateral
        thigh=region*(1-smooth01((pp.z-.42)/.125))*.96
        hip=region*smooth01((pp.z-.42)/.125)*(1-smooth01((pp.z-.545)/.035))*.70
        new_weights={name:weight*(1-thigh-hip) for name,weight in (trunk or {'Pelvis':1}).items()};new_weights.update({'Thigh.'+side:thigh,'Hip.'+side:hip})
    if new_weights:
        influence=smooth01((pp.z-.28)/.07) if ff>0 else smooth01((pp.z-.345)/.10)
        new_weights={name:old.get(name,0)*(1-influence)+new_weights.get(name,0)*influence for name in set(old)|set(new_weights)}
        for group in body.vertex_groups:group.remove([vertex.index])
        for name,weight in new_weights.items():
            if weight>.00001:body.vertex_groups[name].add([vertex.index],weight,'REPLACE')
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
image=bpy.data.images.new('gsp-liver-white-albedo',1024,1024,alpha=False)
image.colorspace_settings.name='sRGB'
tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex;tex.select=True
scene.render.engine='CYCLES';scene.cycles.samples=1
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=12
# A primary direct albedo bake retains sharp markings and subtle face cues.
# Missing rays on intentionally mirrored source limbs are filled below.
import numpy as np
bpy.ops.object.select_all(action='DESELECT');source_ob.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=body
source_ob.hide_render=False;scene.render.bake.use_selected_to_active=True
scene.render.bake.cage_extrusion=.018;scene.render.bake.max_ray_distance=.06
bpy.ops.object.bake(type='DIFFUSE')
primary_pixels=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(primary_pixels)
primary_pixels=primary_pixels.reshape((1024,1024,4))
# Sample source color at nearest triangles into a low-frequency vertex color
# field. This follows both mirrored limbs and ear leather without ray-bake holes.
# Its sparse color field also suppresses photographic fur micro-detail.
import numpy as np
source_material=source_ob.data.materials[0]
source_bs=next(n for n in source_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
color_socket=source_bs.inputs['Base Color']
source_image=color_socket.links[0].from_node.image
width,height=source_image.size
source_pixels=np.empty(width*height*4,dtype=np.float32);source_image.pixels.foreach_get(source_pixels)
source_pixels=source_pixels.reshape((height,width,4))
source_uv=source_ob.data.uv_layers.active.data
color_attr=body.data.color_attributes.new(name='Source coat broad color',type='FLOAT_COLOR',domain='POINT')
for vertex in body.data.vertices:
    pp=vertex.co.copy()
    if pp.x>0:pp.x=-pp.x
    hit,normal,index,distance=source_bvh.find_nearest(pp)
    poly=source_ob.data.polygons[index]
    ia,ib,ic=poly.vertices[:3]
    aa=source_ob.data.vertices[ia].co;bb=source_ob.data.vertices[ib].co;cc=source_ob.data.vertices[ic].co
    v0=bb-aa;v1=cc-aa;v2=hit-aa
    d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1)
    denom=d00*d11-d01*d01
    vb=(d11*d20-d01*d21)/denom if abs(denom)>1e-20 else 0
    vc=(d00*d21-d01*d20)/denom if abs(denom)>1e-20 else 0;va=1-vb-vc
    la,lb,lc=poly.loop_indices[:3]
    uvp=source_uv[la].uv*va+source_uv[lb].uv*vb+source_uv[lc].uv*vc
    fx=(uvp.x%1)*width-.5;fy=(uvp.y%1)*height-.5;ix=int(math.floor(fx));iy=int(math.floor(fy));tx=fx-ix;ty=fy-iy
    rgb=(source_pixels[iy%height,ix%width,:3]*(1-tx)*(1-ty)+source_pixels[iy%height,(ix+1)%width,:3]*tx*(1-ty)+source_pixels[(iy+1)%height,ix%width,:3]*(1-tx)*ty+source_pixels[(iy+1)%height,(ix+1)%width,:3]*tx*ty)
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    color_attr.data[vertex.index].color=(*linear,1)
color_node=nodes.new('ShaderNodeVertexColor');color_node.layer_name=color_attr.name
links.new(color_node.outputs['Color'],bs.inputs['Base Color'])
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
source_ob.hide_render=True
scene.render.bake.use_selected_to_active=False
bpy.ops.object.bake(type='DIFFUSE')
fallback_pixels=np.empty(1024*1024*4,dtype=np.float32);image.pixels.foreach_get(fallback_pixels)
fallback_pixels=fallback_pixels.reshape((1024,1024,4))
missing=np.max(primary_pixels[:,:,:3],axis=2)<.035
combined=primary_pixels*.88+fallback_pixels*.12
combined[missing]=fallback_pixels[missing]
# Force nearest-source color on intentionally mirrored forelegs, close-fitting
# ear leather and tail root. Their changed silhouette makes a direct ray bake
# unreliable; a raster mask avoids a visible boundary down the near foreleg.
body.data.calc_loop_triangles();portable_uv=body.data.uv_layers.active.data
for triangle in body.data.loop_triangles:
    vs=[body.data.vertices[k].co for k in triangle.vertices]
    use_fallback=(all(p.z<.37 and -p.y>.01 for p in vs) or all(-p.y<-.405 and p.z>.58 for p in vs) or all(body.data.attributes['solid_liver'].data[k].value>.8 for k in triangle.vertices))
    if not use_fallback:continue
    points=np.array([portable_uv[k].uv[:] for k in triangle.loops])*1024
    lo=np.maximum(0,np.floor(points.min(axis=0)).astype(int)-1);hi=np.minimum(1023,np.ceil(points.max(axis=0)).astype(int)+1)
    xs,ys=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
    aa,bb,cc=points;denom=(bb[1]-cc[1])*(aa[0]-cc[0])+(cc[0]-bb[0])*(aa[1]-cc[1])
    if abs(denom)<1e-12:continue
    a=((bb[1]-cc[1])*(xs-cc[0])+(cc[0]-bb[0])*(ys-cc[1]))/denom
    b=((cc[1]-aa[1])*(xs-cc[0])+(aa[0]-cc[0])*(ys-cc[1]))/denom
    mask=(a>=-.02)&(b>=-.02)&(a+b<=1.02)
    section=combined[lo[1]:hi[1]+1,lo[0]:hi[0]+1];fallback=fallback_pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
    section[mask]=fallback[mask]

# Quiet just the smallest color detail, never introduce fur normals.
for axis in (0,1):combined=(np.roll(combined,1,axis)+2*combined+np.roll(combined,-1,axis))/4
image.pixels.foreach_set(combined.ravel());image.update()
source_data=source_ob.data;bpy.data.objects.remove(source_ob,do_unlink=True);bpy.data.meshes.remove(source_data)
if source_material.users==0:bpy.data.materials.remove(source_material)
for imported_image in set(bpy.data.images)-original_images:
    if imported_image!=image and imported_image.users==0:bpy.data.images.remove(imported_image)
body.data.color_attributes.remove(color_attr)
image.filepath_raw=str(SOURCE/'gsp-liver-white-albedo.png');image.file_format='PNG';image.save();image.pack()
# Retain only the portable runtime material graph; procedural authoring is in script.
for n in list(nodes):
    if n not in (bs,tex) and n.type!='OUTPUT_MATERIAL':nodes.remove(n)
links.new(tex.outputs['Color'],bs.inputs['Base Color'])
tex.location=(-250,200)

# Facial anatomy: brow contours come from cage; eyes have amber irises and catch
# lights from actual scene lighting. Small tear rims avoid sticker-like eyes.
facemat=principled('GSP muzzle and eye leather',(.031,.015,.01),.66)
eyemat=principled('GSP dark brown iris',(.027,.015,.008),.39)
pupilmat=principled('GSP pupil',(.004,.003,.002),.31)
parts=[body]
def uv_sphere(name,loc,scale,mat,bone_name,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=vec(loc))
    o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    o.data.materials.append(mat);g=o.vertex_groups.new(name=bone_name);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('GSP skeletal deformation','ARMATURE');mod.object=rig;o.parent=rig
    # Mesh coordinates must be in armature space when a modifier references bones.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    parts.append(o);return o
# The eyes lie on the actual refined facial surface. Small external spheres
# were rejected in review because they read as beads from the front. These
# almond plates follow ray-cast skull curvature with sub-millimetre separation.
def eye_plate(name,sgn,radius_f,radius_z,mat,offset):
    ev=[];ef=[];f0=.486;z0=.749
    for j in range(16):
        a=2*pi*j/16;f=f0+cos(a)*radius_f;z=z0+sin(a)*radius_z
        hit,co,normal,index=body.ray_cast(Vector((sgn,-f,z)),Vector((-sgn,0,0)))
        x=co.x if hit else sgn*.067
        ev.append((x+sgn*offset,-f,z))
    hit,co,normal,index=body.ray_cast(Vector((sgn,-f0,z0)),Vector((-sgn,0,0)))
    ev.append((co.x+sgn*offset,-f0,z0))
    for j in range(16):ef.append((j,16,(j+1)%16) if sgn>0 else (j,(j+1)%16,16))
    me=bpy.data.meshes.new(name);me.from_pydata(ev,[],ef);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    vg=ob.vertex_groups.new(name='Head');vg.add(list(range(len(ev))),1,'REPLACE')
    mod=ob.modifiers.new('GSP skeletal deformation','ARMATURE');mod.object=rig;ob.parent=rig;parts.append(ob)
# Small dark almond eyes sit flush on the actual source-conformed skull.
for side,sgn in [('L',1),('R',-1)]:
    eye_plate('Eye lid.'+side,sgn,.011,.0053,facemat,.0006)
    eye_plate('Eye iris.'+side,sgn,.008,.0043,eyemat,.0009)
    eye_plate('Eye pupil.'+side,sgn,.0035,.0034,pupilmat,.0012)
jawmat=principled('GSP jaw coat',liver,.82)

# Merge surface pieces into one skinned mesh; material consolidation below reduces
# the hero to two actual draw groups (coat atlas and small face material).
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body=bpy.context.object;body.name='GSP_LiverWhite_LOD0'
# Consolidate facial colors into a small atlas by adding polygons' flat color to
# a second UV-mapped image. Keep coat + face at two runtime material groups.
faceimage=bpy.data.images.new('gsp-face-palette',16,4,alpha=False)
pixels=[]
facecolors=[facemat.diffuse_color[:3],eyemat.diffuse_color[:3],pupilmat.diffuse_color[:3],liver]
# Blender image pixels are linear; packed PNG encoding handles sRGB conversion.
for yy in range(4):
    for xx in range(16): pixels.extend((*(12.92*c if c<=.0031308 else 1.055*c**(1/2.4)-.055 for c in facecolors[xx//4]),1))
faceimage.pixels[:]=pixels;faceimage.filepath_raw=str(SOURCE/'gsp-face-palette.png');faceimage.file_format='PNG';faceimage.save();faceimage.pack()
faceatlas=principled('GSP face palette',(.1,.03,.01),.7)
faceatlas.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.12
fn=faceatlas.node_tree.nodes.new('ShaderNodeTexImage');fn.image=faceimage;faceatlas.node_tree.links.new(fn.outputs['Color'],faceatlas.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
material_to_slot={facemat.name:0,eyemat.name:1,pupilmat.name:2,jawmat.name:3}
uv=body.data.uv_layers.active
oldslots=list(body.data.materials)
for p in body.data.polygons:
    m=oldslots[p.material_index]
    if m!=coat:
        slot=material_to_slot.get(m.name,0)
        for li in p.loop_indices:uv.data[li].uv=((slot+.5)/4,.5)
        p.material_index=1
    else:p.material_index=0
indices=[p.material_index for p in body.data.polygons]
body.data.materials.clear();body.data.materials.append(coat);body.data.materials.append(faceatlas)
for p,index in zip(body.data.polygons,indices):p.material_index=index
body['topology']='Source-conforming torso, neck/head, split jaw, anatomically weighted limb branches and grafted tail; skinned ear leather and flush eye surfaces'
body['coat']='1024px restrained source albedo and broad source-color fallback; tiny eye palette; no fur normal map'

# Hybrid skin authoring: a volumetric heat field supplies continuous trunk and
# limb transitions. Explicit anatomical face/jaw, ear, tail and sole weights are
# retained with feathered borders; this is not an auto-weight-only result.
anchor_weights=[{body.vertex_groups[g.group].name:g.weight for g in vertex.groups} for vertex in body.data.vertices]
deform_flags={bone.name:bone.use_deform for bone in rig.data.bones}
rig.data.pose_position='REST'
for bone in rig.data.bones:
    bone.use_deform=deform_flags[bone.name] and bone.name not in ('Root','Jaw','Tail01','Tail02','Tail03') and not bone.name.startswith('Ear')
for modifier in list(body.modifiers):
    if modifier.type=='ARMATURE':body.modifiers.remove(modifier)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO',keep_transform=True)
for bone in rig.data.bones:bone.use_deform=deform_flags[bone.name]
for vertex in body.data.vertices:
    pp=vertex.co
    anchor=max(smooth01((.14-pp.z)/.04),smooth01((-pp.y-.27)/.06)*smooth01((pp.z-.48)/.05),body.data.attributes['solid_liver'].data[vertex.index].value,body.data.attributes['tail_surface'].data[vertex.index].value)
    if anchor<1e-6:continue
    current={body.vertex_groups[g.group].name:g.weight for g in vertex.groups};original=anchor_weights[vertex.index]
    combined={name:current.get(name,0)*(1-anchor)+original.get(name,0)*anchor for name in set(current)|set(original)}
    for group in body.vertex_groups:group.remove([vertex.index])
    for name,weight in combined.items():
        if weight>1e-6:
            if name not in body.vertex_groups:body.vertex_groups.new(name=name)
            body.vertex_groups[name].add([vertex.index],weight,'REPLACE')
bpy.context.view_layer.objects.active=body
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
rig.data.pose_position='POSE'
body['weighting']='Volumetric torso/limb field plus feathered explicit anatomical face/jaw, ear, tail and sole weights; four normalized influences before preview and export'
assert max(len(v.groups) for v in body.data.vertices)<=4

# Authored in-place animation. World-space anatomical targets are solved into
# per-bone rotations and baked once; runtime only plays clips + bounded overrides.
FPS=30
CLIPS={
'idle':(3.2,0,True), 'attentive':(2.4,0,True),
'walk':(.84,.85,True), 'trot':(.50,2.4,True), 'lope':(.44,4.4,True),
'start':(.65,0,False), 'stop':(.6,0,False),
'turn_left':(.80,.85,True), 'turn_right':(.80,.85,True),
'scent_check':(2.4,0,True), 'locate':(1.4,.45,True), 'stalk':(1.65,.25,True),
'lock':(.7,0,False), 'point':(3.2,0,True),
'pickup':(1.6,0,False), 'carry':(.84,.85,True), 'deliver':(1.75,0,False), 'heel':(.84,.85,True),
}
REST={name: b.matrix_local.copy() for name,b in rig.data.bones.items()}

def rotate_world(name,axis,angle):
    # Local quaternion derived from parent-relative rest axes: intuitive world
    # pitch/roll/yaw controls do not rely on Blender's per-bone edit roll.
    pb=rig.pose.bones[name]
    localaxis=REST[name].to_3x3().inverted() @ Vector(axis)
    from mathutils import Quaternion
    pb.rotation_quaternion=Quaternion(localaxis,angle)

def pose_clear():
    for pb in rig.pose.bones:pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)

def set_head(name,tilt=0,yaw=0):
    rotate_world(name,(1,0,0),tilt)
    if yaw:
        from mathutils import Quaternion
        pb=rig.pose.bones[name];axis=REST[name].to_3x3().inverted()@Vector((0,0,1));pb.rotation_quaternion=Quaternion(axis,yaw)@pb.rotation_quaternion

def aim_bone(name,target):
    pb=rig.pose.bones[name]
    # Pose matrix head/tail includes upstream rotations and translation.
    current=pb.matrix.copy();head=current.translation;direction=target-head
    if direction.length<1e-7:return
    q=current.to_3x3().col[1].rotation_difference(direction.normalized())
    desired=q.to_matrix().to_4x4()@current;desired.translation=head
    pb.matrix=desired
    bpy.context.view_layer.update()

def ensure_chain_reach(root_name,upper,lower,target):
    # Real canine shoulder/hip motion includes a small sliding component. Move
    # the proximal control just enough to keep the authored stance target valid.
    pb=rig.pose.bones[root_name];a=rig.pose.bones[upper].head.copy();delta=target-a
    limit=rig.data.bones[upper].length+rig.data.bones[lower].length-.002
    if delta.length>limit:
        correction=delta.normalized()*(delta.length-limit)
        basis=(pb.parent.matrix@pb.parent.bone.matrix_local.inverted()@pb.bone.matrix_local) if pb.parent else pb.bone.matrix_local
        pb.location+=basis.to_3x3().inverted()@correction
        bpy.context.view_layer.update()

def solve_chain(upper,lower,end,target,bend_forward):
    a=rig.pose.bones[upper].head.copy();l1=rig.data.bones[upper].length;l2=rig.data.bones[lower].length
    delta=target-a;dist=min(max(delta.length,abs(l1-l2)+.002),l1+l2-.002);d=delta.normalized()
    # Elbow bends behind / knee bends forward in canine sagittal plane.
    bend=Vector((0,-bend_forward,0));bend=(bend-d*bend.dot(d)).normalized()
    along=(l1*l1-l2*l2+dist*dist)/(2*dist);height=math.sqrt(max(0,l1*l1-along*along))
    elbow=a+d*along+bend*height
    aim_bone(upper,elbow);aim_bone(lower,target)


def foot_phase(u,duty,stride,lift,base_f):
    if u<duty:
        return base_f+stride*(.5-u/duty),.0
    q=(u-duty)/(1-duty)
    smooth=q*q*(3-2*q)
    return base_f+stride*(-.5+smooth),lift*sin(pi*q)**1.2

contacts={}
for name,(duration,speed,looping) in CLIPS.items():
    action=bpy.data.actions.new(name);action.use_fake_user=True
    rig.animation_data_create();rig.animation_data.action=action
    count=round(duration*FPS);duration=count/FPS
    contacts[name]={}
    for frame in range(count+1):
        scene.frame_set(frame);pose_clear();t=frame/count;phase=2*pi*t
        moving=name in ('walk','trot','lope','turn_left','turn_right','locate','stalk','carry','heel')
        gait='trot' if name=='trot' else 'lope' if name=='lope' else 'walk'
        duty={'walk':.62,'trot':.42,'lope':.26}[gait]
        stride=speed*duration*duty if moving else 0
        lift={'walk':.056,'trot':.105,'lope':.15}[gait]
        if name in ('locate','stalk'):lift=.035
        # u = t + offset, so walking touchdown order from FL is
        # FL -> HR -> FR -> HL: hind then ipsilateral fore, lateral sequence.
        gait_offsets={'walk':{'FL':0,'HL':.25,'FR':.5,'HR':.75},'trot':{'FL':0,'HR':0,'FR':.5,'HL':.5},'lope':{'FL':0,'FR':.13,'HL':.57,'HR':.70}}[gait]
        bodybob=(.004 if not moving else {'walk':.006,'trot':.012,'lope':.023}[gait])*(1-cos(phase*(2 if moving and gait!='lope' else 1)))/2
        rig.pose.bones['Root'].location=(0,0,0) # Explicit root translation authority.
        # Pelvis translation uses parent-space matrix conversion.
        pb=rig.pose.bones['Pelvis'];pb.location=REST['Pelvis'].to_3x3().inverted()@Vector((0,0,bodybob))
        rotate_world('Spine',(1,0,0),(.035 if name=='lope' else .008)*sin(phase))
        set_head('Neck',.014*sin(phase));set_head('Head',.016*sin(phase+.3))
        # Small lateral spine counter-rotation makes turns read without rotating Root.
        if name in ('turn_left','turn_right'):
            sign=1 if name=='turn_left' else -1
            rotate_world('Chest',(0,0,1),sign*.10)
            set_head('Neck',0,sign*.18);set_head('Head',0,sign*.12)
        if name in ('attentive','point','lock'):
            strength=min(1,t*1.4) if name=='lock' else 1
            set_head('Neck',.055*strength);set_head('Head',-.035*strength)
            rotate_world('Tail01',(1,0,0),-.22*strength)
        elif name in ('scent_check','locate','stalk'):
            set_head('Neck',.18+.055*sin(phase));set_head('Head',.16+.04*sin(phase*2),.10*sin(phase) if name=='scent_check' else 0)
            rotate_world('Tail01',(1,0,0),-.1)
        elif name in ('pickup','deliver'):
            dip=smooth01(min(1,t/.9)) if name=='pickup' else .45*sin(pi*t)**2
            # Lower shoulders and neck with a flexible upper back; jaw opens at
            # contact and closes for return, without translating the Root.
            set_head('Chest',dip*(.45 if name=='pickup' else .15));set_head('Neck',dip*.91);set_head('Head',dip*.08 if name=='pickup' else dip*.39)
            if name=='pickup':rig.pose.bones['Pelvis'].location+=REST['Pelvis'].to_3x3().inverted()@Vector((0,0,-.085*dip))
            set_head('Jaw',dip*.15)
        elif name=='carry':
            set_head('Neck',.03);set_head('Head',.06);set_head('Jaw',.13)
        elif name=='start':
            set_head('Chest',-.045*sin(pi*t));set_head('Neck',.04*sin(pi*t))
        elif name=='stop':
            set_head('Chest',.045*sin(pi*t));set_head('Neck',-.06*sin(pi*t))
        for side,sgn in [('L',1),('R',-1)]:
            rotate_world('EarBase.'+side,(0,1,0),sgn*.026*sin(phase+(.6 if side=='L' else .8)))
            rotate_world('EarTip.'+side,(1,0,0),(.07 if moving else .015)*sin(phase-.6))
        # Tail is carried confidently; only a restrained base-independent tip wag.
        rotate_world('Tail02',(0,0,1),(.03 if name in ('point','lock') else .12)*sin(phase))
        rotate_world('Tail03',(0,0,1),(.02 if name=='point' else .09)*sin(phase-.4))
        bpy.context.view_layer.update()
        for side,sgn in [('L',1),('R',-1)]:
            for front in (True,False):
                key=('F' if front else 'H')+side
                u=(t+gait_offsets[key])%1
                f0=.166 if front else -.36 if moving else -.531
                footf,liftz=foot_phase(u,duty,stride,lift,f0) if moving else (f0,0)
                # A point lifts and tucks the left forepaw while the other three
                # remain planted; lock is a dedicated gradual transition.
                pointamount=min(1,t*1.8) if name=='lock' else 1 if name=='point' else 0
                if front and side=='L' and pointamount:
                    footf-=.035*pointamount;liftz+=.085*pointamount
                # Start/stop anticipation preserves planted feet.

                target=v(sgn*(.062 if front else .065),footf,.095+liftz if front else .128+liftz)
                if front:
                    rotate_world('Shoulder.'+side,(1,0,0),-(footf-f0)*1.5)
                    if moving:
                        rig.pose.bones['Shoulder.'+side].location=REST['Shoulder.'+side].to_3x3().inverted()@Vector((0,0,-.026*(abs(footf-f0)/max(.001,stride/2))**2))
                    bpy.context.view_layer.update()
                    ensure_chain_reach('Shoulder.'+side,'UpperArm.'+side,'Forearm.'+side,target)
                    solve_chain('UpperArm.'+side,'Forearm.'+side,'Carpus.'+side,target,-1)
                    # Carpus and paws retain level ground contact in stance.
                    aim_bone('Carpus.'+side,v(sgn*.064,footf+.008,.042+liftz))
                    aim_bone('FrontPaw.'+side,v(sgn*.064,footf+.061,.022+liftz))
                else:
                    if moving:
                        rotate_world('Hip.'+side,(1,0,0),-(footf-f0)*1.7)
                        bpy.context.view_layer.update()
                    ensure_chain_reach('Hip.'+side,'Thigh.'+side,'Shin.'+side,target)
                    solve_chain('Thigh.'+side,'Shin.'+side,'Hock.'+side,target,1)
                    aim_bone('Hock.'+side,v(sgn*.065,footf-.020,.039+liftz))
                    aim_bone('HindPaw.'+side,v(sgn*.065,footf+.018,.023+liftz))
                if frame==0:
                    support=0 if name in ('point','lock') and key=='FL' else duty if moving else 1
                    contacts[name][key]={'offset':gait_offsets[key] if moving else 0,'stanceFraction':support,'mode':'lifted' if name=='point' and key=='FL' else 'lifting' if name=='lock' and key=='FL' else 'gait' if moving else 'planted'}
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
            if pb.name in ('Pelvis','Shoulder.L','Shoulder.R','Hip.L','Hip.R'):pb.keyframe_insert('location',frame=frame,group=pb.name)
    action['loop']=looping;action['nominal_speed_mps']=speed;action['duration_seconds']=duration
    # Modern Blender action channels are slotted. Use linear baked sampling.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for key in fc.keyframe_points:key.interpolation='LINEAR'

rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0)

# Editable blend includes a small provenance empty and original anatomical cage
# as a hidden custom snapshot, making later direct mesh work straightforward.
ref=bpy.data.objects.new('Original source reference (preserved GLB)',None);bpy.context.collection.objects.link(ref)
ref['path']='../../../GSP-liver-white.glb';ref['role']='Visual source, not runtime mesh';ref.hide_render=True
reference_path=ROOT/'GSP-liver-white.glb'
source_sha=hashlib.sha256(reference_path.read_bytes()).hexdigest() if reference_path.exists() else 'unavailable'
ref['sha256']=source_sha

# Studio scene is a diagnostic preview, deliberately separate from gameplay.
scene.world.color=(.15,.15,.15)
world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.37,.42,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));ground=bpy.context.object;ground.name='STUDIO ground';ground.data.materials.append(principled('STUDIO oat paper',(.23,.25,.245),.9))
def area(name,loc,energy,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,-.1,.5))-o.location).to_track_quat('-Z','Y').to_euler()
area('STUDIO large warm key',(-2,-3,4),450,4)
area('STUDIO sky fill',(3,1,3),250,3)
camdata=bpy.data.cameras.new('STUDIO camera');cam=bpy.data.objects.new('STUDIO camera',camdata);bpy.context.collection.objects.link(cam);scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
camdata.type='ORTHO';camdata.ortho_scale=1.6

def camera(loc):
    cam.location=loc;cam.rotation_euler=(Vector((0,-.11,.46))-cam.location).to_track_quat('-Z','Y').to_euler()
camera((2,-3,1.6))
# Put render-only objects in a clearly named collection, excluded from exports.
studio=bpy.data.collections.new('STUDIO diagnostic preview only');scene.collection.children.link(studio)
for ob in [ground,cam]+[o for o in bpy.data.objects if o.type=='LIGHT']:
    for c in list(ob.users_collection):c.objects.unlink(ob)
    studio.objects.link(ob)

# Save the hero source before producing lower levels of detail.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'gsp-liver-white.blend'))
metrics=[]
if not opt.no_export:
    for lod,ratio in [(0,1),(1,.42),(2,.18)]:
        exportbody=body
        if lod:
            exportbody=body.copy();exportbody.data=body.data.copy();bpy.context.collection.objects.link(exportbody);exportbody.name=f'GSP_LiverWhite_LOD{lod}'
            bpy.ops.object.select_all(action='DESELECT');exportbody.select_set(True);bpy.context.view_layer.objects.active=exportbody
            mod=exportbody.modifiers.new('Distance simplification of authored hero','DECIMATE');mod.ratio=ratio
            bpy.ops.object.modifier_move_up(modifier=mod.name)
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
            bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
        bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);exportbody.select_set(True);bpy.context.view_layer.objects.active=rig
        path=OUT/f'gsp-liver-white-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_skins=True,export_all_influences=False,export_def_bones=False,export_force_sampling=True,export_optimize_animation_size=True,export_materials='EXPORT',export_image_format='AUTO',export_extras=True)
        exportbody.data.calc_loop_triangles()
        metrics.append(dict(lod=lod,file=path.name,vertices=len(exportbody.data.vertices),triangles=len(exportbody.data.loop_triangles),bytes=path.stat().st_size))
        if lod:bpy.data.objects.remove(exportbody,do_unlink=True)
    manifest={
      'schema':1,'asset':'Uplandin liver-and-white German Shorthaired Pointer','source':{'file':'GSP-liver-white.glb','sha256':source_sha,'usage':'Source-conforming authored retopology and restrained albedo bake; no hero decimation'},
      'coordinates':{'units':'metres','forward':'+Z','up':'+Y','shoulderHeight':.635,'noseForward':.62,'hindPawForward':-.54},
      'rig':'GSP_Rig','mesh':'GSP_LiverWhite_LOD0','bones':list(BONES),
      'lods':metrics,'materials':2,'textures':['1024x1024 albedo','16x4 facial palette'],
      'animations':[{ 'name':n,'duration':round(d*FPS)/FPS,'nominalSpeed':s,'loop':loop,'contacts':contacts[n]} for n,(d,s,loop) in CLIPS.items()],
      'motionAuthority':'Root has no translation or yaw keys. Simulation owns position and heading. Nominal clip speed controls gait playback rate.',
      'proceduralOwnership':'Mixer owns skeletal motion. Optional post-mixer terrain IK may adjust shoulder/arm/paw chains; restore mixer transforms each update. Head gaze affects only Head; mouth item attaches to MouthSocket.',
      'previewDisclaimer':'Studio renders and authored clips are asset diagnostics, not gameplay acceptance evidence.',
    }
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('GSP_ASSET_METRICS',json.dumps(metrics))
if opt.render or opt.preview:
    for title,loc,action,frame in [('three-quarter',(2,-3,1.5),'idle',0),('side',(3,0,1),'idle',0),('front',(0,-3,.95),'idle',0),('rear',(1,3,1),'idle',0),('point',(2,-3,1.4),'point',18)]:
        if opt.preview and (opt.quick or title not in ('side','front','three-quarter')):continue
        camera(loc);rig.animation_data.action=bpy.data.actions[action];scene.frame_set(frame);scene.render.filepath=str(RENDERS/(title+'.png'));bpy.ops.render.render(write_still=True)
if opt.preview:
    for title,clip,frame in [('point','point',18),('trot','trot',7),('pickup','pickup',48)]:
        if opt.quick and title!='trot':continue
        camera((2,-3,1.4) if title=='point' else (3,0,1));rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame);scene.render.filepath=str(RENDERS/(title+'.png'));bpy.ops.render.render(write_still=True)
if opt.preview:
    clay=principled('DIAGNOSTIC clay',(.35,.35,.35),.8);scene.view_layers[0].material_override=clay
    camera((3,0,1));rig.animation_data.action=bpy.data.actions['trot'];scene.frame_set(7);scene.render.filepath=str(RENDERS/'trot-clay.png');bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override=None
if opt.animation_frames:
    camera((3,0,1));scene.render.resolution_x=720;scene.render.resolution_y=540;scene.cycles.samples=16
    for clip in ['walk','trot','lope','point','pickup','carry','deliver']:
        rig.animation_data.action=bpy.data.actions[clip];count=round(CLIPS[clip][0]*FPS)
        for i in range(6):
            scene.frame_set(round(count*i/6));scene.render.filepath=str(RENDERS/f'{clip}-{i:02}.png');bpy.ops.render.render(write_still=True)
print('GSP_BUILD_COMPLETE')
