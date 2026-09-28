# Deterministic authored 3D source: metres, nine overlapping crowns,216 leaves.
# Based on the reviewed Blender source; no baked lighting or external assets.
# stdout is the complete source mesh consumed by the reduction tool.
import math, random, json, sys
verts=[];faces=[];cols=[];wind=[]
rng=random.Random(94073)
verts=[];faces=[];cols=[];wind=[]
# An asset-local metre scale. Individual crowns overlap beneath a continuous
# irregular edge, rather than becoming independently outlined round islands.
crowns=[(-.19,-.11,.92),(.01,-.19,1),(.19,-.09,.86),(-.12,.09,.9),(.08,.07,1.05),(.21,.12,.75),(-.19,.20,.72),(.005,.22,.76),(0,0,1.12)]
leaves=[]
for ri,(rx,ry,vigor) in enumerate(crowns):
    for j in range(24):
        angle=j*2.399963+ri*.93+rng.uniform(-.48,.48)
        rootx=rx+rng.uniform(-.035,.035);rooty=ry+rng.uniform(-.035,.035)
        # Unequal bowed leaves grow off-centre and end below the crown.
        mature=j%6!=0
        h=vigor*rng.uniform(.22,.40)*(1 if mature else .48)
        reach=rng.uniform(.10,.23) if mature else rng.uniform(.15,.27)
        w=rng.uniform(.006,.011)
        dry=not mature and j%2==0
        leaves.append((rootx,rooty,angle,h,reach,w,dry))
for li,(rx,ry,a,h,reach,w,dry) in enumerate(leaves):
    vbase=len(verts);d=(math.cos(a),math.sin(a));side=(-d[1],d[0]);phase=rng.random()
    ascending=li%4==0
    end=rng.uniform(.87,1.0) if ascending else rng.uniform(.48,.76)
    control=rng.uniform(.72,.91) if ascending else rng.uniform(.92,1.20)
    roll=rng.uniform(-.18,.18);tint=rng.uniform(.84,1.12)
    for s in range(6):
        t=s/5
        run=reach*(3*(1-t)**2*t*.06+3*(1-t)*t*t*.48+t**3)
        z=h*(3*(1-t)**2*t*.49+3*(1-t)*t*t*control+t**3*end)
        width=w*max(.008,(1-t)**.86)*(.89+.11*math.sin(math.pi*t))
        cx=rx+d[0]*run+side[0]*math.sin(t*3.1)*roll*.08
        cy=ry+d[1]*run+side[1]*math.sin(t*3.1)*roll*.08
        for e in [-1,0,1]:
            fold=(1-abs(e))*w*.18*math.sin(t*math.pi)
            verts.append((cx+side[0]*width*e,cy+side[1]*width*e,z+fold))
            value=(.30+.43*t)*tint
            # Neutral albedo is recolored in the field; no baked directional light.
            color=(value*(1.03 if dry else .99),value,value*(.82 if dry else .89),1)
            cols.append(color);wind.append((phase,t))
    for s in range(5):
        a0=vbase+s*3;b0=a0+3
        for e in range(2):faces.extend([(a0+e,a0+e+1,b0+e),(a0+e+1,b0+e+1,b0+e)])
source={'units':'metres','positions':[[x,z,-y] for x,y,z in verts],'indices':faces,'colors':cols,'wind':wind,'leaves':len(leaves),'triangles':len(faces),'bounds':[[min(v[k] for v in verts) for k in range(3)],[max(v[k] for v in verts) for k in range(3)]]}
sys.stdout.write(json.dumps(source,separators=(',',':')))
