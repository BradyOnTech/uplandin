"""Render one diagnostic pose from a saved asset, without changing the input blend."""
import argparse,sys
from pathlib import Path
import bpy
from mathutils import Vector
parser=argparse.ArgumentParser()
parser.add_argument('--source-file',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--clip',default='idle')
parser.add_argument('--frame',type=int,default=0)
parser.add_argument('--view',choices=['side','front','three-quarter'],default='side')
parser.add_argument('--clay',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.open_mainfile(filepath=str(args.source_file))
scene=bpy.context.scene;rig=bpy.data.objects['GSP_Rig'];body=bpy.data.objects['GSP_LiverWhite_LOD0']
rig.animation_data.action=bpy.data.actions[args.clip];scene.frame_set(args.frame)
if args.clay:
    mat=bpy.data.materials.new('DIAGNOSTIC neutral clay');mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.35,.35,.35,1);bs.inputs['Roughness'].default_value=.8
    body.data.materials.clear();body.data.materials.append(mat)
    for polygon in body.data.polygons:polygon.material_index=0
cam=scene.camera;cam.location={'side':(3,0,1),'front':(0,-3,.95),'three-quarter':(2,-3,1.5)}[args.view]
cam.rotation_euler=(Vector((0,-.11,.46))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.cycles.samples=24
args.output.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(args.output)
bpy.ops.render.render(write_still=True)
