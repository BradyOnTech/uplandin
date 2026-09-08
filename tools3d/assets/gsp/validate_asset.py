"""Validate the shipped GLBs themselves, without needing Blender or GPU rendering.

This checks the asset contract; it does not claim animation appeal or gameplay
readiness. A separate Blender deformation report samples the authored poses.
"""
import argparse,hashlib,json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--directory',type=Path,default=ROOT/'public/models/gsp',help='Runtime package directory; permits checking a candidate before promotion.')
DIRECTORY=parser.parse_args().directory.resolve()

def glb(path):
    data=path.read_bytes();magic,version,size=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and size==len(data)
    chunks={};offset=12
    while offset<len(data):
        length,kind=struct.unpack_from('<I4s',data,offset);offset+=8
        chunks[kind]=data[offset:offset+length];offset+=length
    return json.loads(chunks[b'JSON']),chunks[b'BIN\0']

def accessor(g,b,index):
    a=g['accessors'][index];view=g['bufferViews'][a['bufferView']]
    types={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    fmt='<'+types[a['componentType']]*components[a['type']]
    size=struct.calcsize(fmt);stride=view.get('byteStride',size)
    start=view.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from(fmt,b,start+i*stride) for i in range(a['count'])]

manifest=json.loads((DIRECTORY/'manifest.json').read_text());expected={a['name']:a for a in manifest['animations']}
results=[]
for entry in manifest['lods']:
    path=DIRECTORY/entry['file'];g,b=glb(path)
    assert len(g['skins'])==1, 'one authoritative skeleton required'
    names={n.get('name') for n in g['nodes']}
    assert set(manifest['bones']).issubset(names), 'missing named animation/attachment bones'
    assert len(g['materials'])==2, 'coat and face material contract'
    assert len(g['images'])==2, 'two portable embedded textures required'
    animations={a['name']:a for a in g.get('animations',[])}
    assert set(animations)==set(expected),f'clip mismatch: {set(animations)^set(expected)}'
    for name,anim in animations.items():
        duration=max(max(x[0] for x in accessor(g,b,s['input'])) for s in anim['samplers'])
        assert abs(duration-expected[name]['duration'])<.001,(name,duration)
        for channel in anim['channels']:
            node=g['nodes'][channel['target']['node']]
            values=accessor(g,b,anim['samplers'][channel['sampler']]['output'])
            assert all(math.isfinite(x) for val in values for x in val)
            if node.get('name')=='Root':
                assert all(max(abs(x-y) for x,y in zip(values[0],val))<1e-6 for val in values),'Root must be in-place'
    triangles=0;verts=0;max_weight_error=0
    for mesh in g['meshes']:
        for primitive in mesh['primitives']:
            attr=primitive['attributes'];positions=accessor(g,b,attr['POSITION']);weights=accessor(g,b,attr['WEIGHTS_0']);joints=accessor(g,b,attr['JOINTS_0'])
            verts+=len(positions);triangles+=len(accessor(g,b,primitive['indices']))//3
            assert all(math.isfinite(x) for pos in positions for x in pos)
            for w,j in zip(weights,joints):
                max_weight_error=max(max_weight_error,abs(sum(w)-1))
                assert abs(sum(w)-1)<1e-4 and min(w)>=0
                assert all(0<=index<len(g['skins'][0]['joints']) for index in j)
    assert triangles==entry['triangles'],(triangles,entry)
    assert path.stat().st_size==entry['bytes'],'Manifest byte count differs from exported file'
    if entry.get('sha256'):
        assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'],'Manifest asset hash differs from exported file'
    results.append({'lod':entry['lod'],'triangles':triangles,'exportedVertices':verts,'bytes':len(path.read_bytes()),'bones':len(g['skins'][0]['joints']),'clips':len(animations),'materials':len(g['materials']),'maxWeightSumError':max_weight_error,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
source=ROOT/manifest['source']['file']
assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['source']['sha256'],'original source changed'
report={'status':'asset contract passed','limitations':['Does not establish visual approval, slope foot contact, browser performance, or complete gameplay readiness.'],'assets':results}
(DIRECTORY/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
