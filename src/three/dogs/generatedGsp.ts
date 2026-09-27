import * as THREE from 'three';
import { createLocomotionPose, writeLocomotionPose, type LocomotionGait, type FootTuple } from './locomotion';
import { createTwoBoneSolution, solveTwoBone } from './legIk';
import { germanShorthairedPointerAppearance, type GspCoatId } from './germanShorthairedPointer';

/** Authored in metres, +Z nose. Geometry is generated once, never per frame. */
type Ring = readonly [x: number, y: number, z: number, width: number, height: number, underside?: number];
type Point = readonly [number, number, number];
export const GENERATED_STRIDE_SCALE: Record<LocomotionGait,number> = {walk:.72,trot:.95,canter:.95,gallop:1};
export const GENERATED_STRIDE: Record<LocomotionGait,number> = {walk:.72*.72,trot:.94*.95,canter:1.38*.95,gallop:1.9};
const GENERATED_GALLOP_TOUCHDOWN: FootTuple<number> = [.58,.50,.08,0];
const WHITE = 0xd1cdc1, LIVER = 0x51382e, NOSE = 0x332722, EYE = 0x211c17;
/** Head-relative grip: the mandible moves around it, never drives the bird. */
export const GENERATED_MOUTH_GRIP: Point = [0, -.065, .125];

/** Coat coordinates stay in the bind pose so pigment follows the skin. */
function applyGspCoat(material: THREE.MeshLambertMaterial, coatId: GspCoatId): void {
  const appearance = germanShorthairedPointerAppearance(coatId);
  material.onBeforeCompile = shader => {
    shader.uniforms.gspWhite = { value: new THREE.Color(coatId === 'liver-white' ? WHITE : appearance.ground) };
    shader.uniforms.gspLiver = { value: new THREE.Color(coatId === 'liver-white' ? LIVER : appearance.primary) };
    shader.uniforms.gspRoan = { value: appearance.pattern === 'roan' ? 1 : 0 };
    shader.uniforms.gspSolid = { value: appearance.pattern === 'solid' ? 1 : 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vGspBindPosition;
varying float vGspWhiteSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGspBindPosition = position;
vGspWhiteSurface = step(0.25, color.r);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGspBindPosition;
varying float vGspWhiteSurface;
uniform vec3 gspWhite;
uniform vec3 gspLiver;
uniform float gspRoan;
uniform float gspSolid;
float gspIsland(vec3 point, vec3 center, vec3 radius) {
  vec3 p = (point - center) / radius;
  float edge = length(p) + 0.075 * sin(point.z * 53.0 + point.y * 31.0)
    + 0.045 * sin(point.x * 91.0 - point.y * 61.0);
  return 1.0 - smoothstep(0.96, 1.025, edge);
}
float gspHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
if (vGspWhiteSurface > 0.5) {
  vec3 p = vGspBindPosition;
  float liverArea = max(gspIsland(p, vec3(-0.085, 0.55, 0.125), vec3(0.15, 0.155, 0.175)),
    gspIsland(p, vec3(0.105, 0.57, -0.31), vec3(0.16, 0.13, 0.14)));
  liverArea = max(liverArea, gspIsland(p, vec3(0.095, 0.555, 0.24), vec3(0.115, 0.115, 0.10)));
  // Sparse, small ticking breaks up the white without a noisy roan texture.
  vec3 cell = floor(p * 91.0);
  float choice = gspHash(cell);
  vec3 center = vec3(gspHash(cell + 3.1), gspHash(cell + 7.7), gspHash(cell + 11.3));
  float spot = (1.0 - smoothstep(0.10, 0.23, length(fract(p * 91.0) - center))) * step(mix(0.76, 0.32, gspRoan), choice);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  spot *= 1.0 - smoothstep(0.0025, 0.009, footprint);
  float underside = 1.0 - smoothstep(0.26, 0.56, p.y);
  vec3 cleanCoat = gspWhite * (1.0 - underside * 0.025);
  diffuseColor.rgb = mix(cleanCoat, gspLiver, max(gspSolid, max(liverArea, spot * mix(0.70, 0.92, gspRoan))));
}`);
  };
  material.customProgramCacheKey = () => 'generated-gsp-bind-coat-v2';
}

class Surface {
  private positions: number[] = [];
  private colors: number[] = [];
  constructor(private sides: number) {}
  loft(rings: readonly Ring[], color: number | ((p: THREE.Vector3) => number), axis: 'z' | 'y' = 'z'): void {
    const vertices = rings.map(([x, y, z, w, h, underside = h]) => Array.from({ length: this.sides }, (_, i) => {
      const a = i * Math.PI * 2 / this.sides;
      const height = Math.sin(a) < 0 ? underside : h;
      return new THREE.Vector3(x + Math.cos(a) * w, y + (axis === 'z' ? Math.sin(a) * height : 0), z + (axis === 'y' ? -Math.sin(a) * height : 0));
    }));
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const shade = new THREE.Color(typeof color === 'number' ? color : color(center));
      for (const v of [a, b, c]) { this.positions.push(v.x, v.y, v.z); this.colors.push(shade.r, shade.g, shade.b); }
    };
    for (let r = 1; r < rings.length; r++) for (let i = 0; i < this.sides; i++) {
      const j = (i + 1) % this.sides;
      tri(vertices[r - 1][i], vertices[r - 1][j], vertices[r][i]);
      tri(vertices[r - 1][j], vertices[r][j], vertices[r][i]);
    }
    for (let i = 0; i < this.sides; i++) {
      const j = (i + 1) % this.sides;
      tri(vertices[0][j], vertices[0][i], new THREE.Vector3(...rings[0].slice(0, 3) as [number, number, number]));
      const last = rings.length - 1;
      tri(vertices[last][i], vertices[last][j], new THREE.Vector3(...rings[last].slice(0, 3) as [number, number, number]));
    }
  }
  geometry(softness = 0): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    if (softness > 0) {
      // Blend lighting across duplicated loft vertices without changing the
      // faceted silhouette or introducing extra geometry/materials.
      const normal = g.getAttribute('normal');
      const sums = new Map<string, THREE.Vector3>();
      const keys = this.positions.reduce<string[]>((result, _, i) => {
        if (i % 3 === 0) result.push(this.positions.slice(i, i + 3).map(v => v.toFixed(6)).join(','));
        return result;
      }, []);
      keys.forEach((key, i) => {
        const sum = sums.get(key) ?? new THREE.Vector3();
        sum.add(new THREE.Vector3().fromBufferAttribute(normal, i)); sums.set(key, sum);
      });
      for (const sum of sums.values()) sum.normalize();
      const blended = new THREE.Vector3();
      keys.forEach((key, i) => {
        blended.fromBufferAttribute(normal, i).lerp(sums.get(key)!, softness).normalize();
        normal.setXYZ(i, blended.x, blended.y, blended.z);
      });
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export function createGeneratedGsp(detail: 'high' | 'lite' = 'high', live = false, coatId: GspCoatId = 'liver-white') {
  const sides = detail === 'high' ? 10 : 6;
  const root = new THREE.Group(); root.name = 'generated-gsp';
  const appearance = germanShorthairedPointerAppearance(coatId);
  const pigment = coatId === 'liver-white' ? LIVER : appearance.primary;
  const nose = coatId === 'black-roan' ? appearance.nose : NOSE;
  root.userData.coatId = coatId; root.userData.coatLabel = appearance.label;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  applyGspCoat(material, coatId);
  const geometries: THREE.BufferGeometry[] = [];
  const joints: Record<string, THREE.Bone> = {};
  const joint = (name: string, parent: THREE.Object3D, position: Point) => {
    const group = new THREE.Bone(); group.name = name; group.position.set(...position); parent.add(group); joints[name] = group; return group;
  };
  const surface = (parent: THREE.Object3D, author: (s: Surface) => void, softness = 0) => {
    const s = new Surface(sides); author(s); const geometry = s.geometry(softness); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const body = joint('body', root, [0, 0, 0]);
  const torsoMesh = surface(body, s => s.loft([
    // A continuous ribcage tapers into the flank. Keep the upper contour
    // quiet while the underside rises gradually behind the deep chest.
    [0,.526,-.39,.040,.067,.065], [0,.528,-.355,.070,.089,.088], [0,.534,-.30,.091,.097,.102],
    [0,.548,-.23,.088,.083,.103], [0,.548,-.16,.081,.087,.098], [0,.53,-.08,.091,.107,.107],
    [0,.516,0,.108,.129,.137], [0,.51,.08,.115,.140,.158], [0,.513,.16,.114,.143,.168],
    [0,.535,.23,.100,.127,.177], [0,.567,.275,.082,.103,.145], [0,.596,.315,.066,.089,.105],
    [0,.622,.35,.052,.070,.077], [0,.642,.385,.043,.052,.060], [0,.649,.410,.039,.042,.050],
  ], WHITE), .88);
  const neck = joint('neck', body, [0,.51,.245]);
  torsoMesh.userData.neckJoint = neck;
  const head = joint('head', neck, [0,.155,.135]);
  surface(head, s => {
    // The upper muzzle ends at the lip, leaving room for a real mandible.
    // A long nasal bridge and shallow stop retain the adult GSP profile.
    s.loft([[0,.006,-.072,.037,.037,.042],[0,.008,-.048,.049,.035,.044],
      [0,.008,-.012,.060,.041,.049],[0,.005,.026,.060,.037,.052],
      [0,-.003,.056,.054,.032,.020],[0,-.008,.077,.046,.030,.013],
      [0,-.006,.111,.042,.029,.013],[0,-.003,.145,.035,.027,.015],
      [0,-.002,.171,.035,.024,.017]], pigment);
    s.loft([[0,-.001,.166,.035,.024,.027],[0,.001,.18,.034,.022,.023]], nose);
    // The oral roof stays dark, including when viewed from below; it is
    // geometry in the existing skin, not a hole through the head or a decal.
    s.loft([[0,-.022,.044,.028,.0015],[0,-.020,.088,.035,.0015],
      [0,-.018,.137,.029,.0015],[0,-.017,.165,.024,.0015]], NOSE);
    // Small eyes sit at the skull/muzzle transition, without white cartoon sclera.
    for (const side of [-1, 1]) s.loft([[side*.057,.017,.027,.0025,.0031],
      [side*.055,.017,.037,.0027,.0026]], EYE);
  }, .78);
  const jaw = joint('jaw', head, [0,-.027,.026]);
  surface(jaw, s => {
    s.loft([[0,-.004,.003,.034,.012],[0,-.014,.045,.037,.013],
      [0,-.008,.091,.033,.012],[0,-.003,.126,.029,.009],
      [0,0,.142,.023,.007]], pigment);
    // A small dark inner surface and soft lower lip describe a relaxed
    // grip without large white teeth or a bright, cartoon tongue.
    s.loft([[0,.003,.021,.027,.0015],[0,0,.065,.030,.0015],
      [0,.005,.112,.025,.0015],[0,.006,.135,.020,.001]], NOSE);
  }, .78);
  for (const side of [-1, 1]) {
    const ear = joint(side < 0 ? 'ear-left' : 'ear-right', head, [side*.052,.019,-.012]);
    // Thin leather rolls out from the skull, then hangs against the cheek;
    // the narrow rounded tip is not the bottom edge of a solid paddle.
    surface(ear, s => s.loft([[side*.006,-.110,.041,.0025,.007],
      [side*.010,-.100,.033,.0035,.017],[side*.012,-.081,.020,.004,.027],
      [side*.011,-.054,.008,.0045,.033],[side*.007,-.027,-.002,.0045,.030],
      [0,0,0,.0045,.024]], pigment, 'y'), .82);
  }
  const tail = joint('tail', body, [0,.578,-.366]);
  surface(tail, s => s.loft([[0,.018,-.252,.0025,.003],[0,.022,-.18,.006,.007],[0,.012,-.085,.013,.014],[0,0,0,.020,.022]], WHITE), .8);
  const paws: THREE.Bone[] = [];
  for (let i = 0; i < 4; i++) {
    const fore = i < 2, side = i % 2 ? 1 : -1, prefix = `${fore ? 'front' : 'hind'}-${side < 0 ? 'left' : 'right'}`;
    const upper = joint(prefix, body, [side*.068,.515,fore ? .205 : -.292]);
    const upperEnd: Point = [0,fore ? -.195 : -.205,fore ? -.055 : .090];
    const lowerEnd: Point = [0,fore ? -.25 : -.17,fore ? .062 : -.110];
    const distalEnd: Point = [0,fore ? -.048 : -.117,fore ? .012 : .016];
    const lower = joint(prefix+'-lower', upper, upperEnd);
    const distal = joint(prefix+'-distal', lower, lowerEnd);
    const paw = joint(prefix+'-paw', distal, distalEnd); paws.push(paw);
    // A continuous leg envelope spans the joints. Skin weights bend the
    // envelope; separate rigid tubes would expose caps during a stride.
    const wristY = upperEnd[1] + lowerEnd[1], wristZ = upperEnd[2] + lowerEnd[2];
    const ankleY = wristY + distalEnd[1], ankleZ = wristZ + distalEnd[2];
    const legMesh = surface(upper, s => s.loft([
      [0,ankleY-.004,ankleZ,.016,.018],
      [0,(ankleY+wristY)*.5,(ankleZ+wristZ)*.5,.017,.020],
      [0,wristY,wristZ,.021,.025],
      [0,wristY+.030,wristZ-.005,.020,.024],
      [0,upperEnd[1]+lowerEnd[1]*.50,upperEnd[2]+lowerEnd[2]*.50,fore ? .024 : .027,fore ? .029 : .035],
      [0,upperEnd[1],upperEnd[2],fore ? .030 : .034,fore ? .038 : .045],
      [side*.006,upperEnd[1]*.64,upperEnd[2]*.65,fore ? .037 : .054,fore ? .054 : .077],
      [side*.008,-.054,fore ? -.006 : .008,fore ? .046 : .067,fore ? .072 : .091],
      [side*.003,.008,-.006,fore ? .044 : .053,fore ? .065 : .067],
      [0,.062,-.014,.025,.037],
    ], WHITE, 'y'), .9);
    legMesh.userData.skinChain = [upper, lower, distal, paw];
    surface(paw, s => s.loft([[0,.002,-.025,.014,.012],[0,.005,-.002,.023,.018],
      [0,-.001,.026,.027,.018],[0,-.005,.047,.023,.013],[0,-.006,.056,.014,.010]], WHITE), .72);
  }
  // Bake bind-space geometry into one draw call, retaining code-authored bones.
  root.updateMatrixWorld(true);
  const bones = Object.values(joints), positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [], weights: number[] = [];
  const meshes: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  for (const mesh of meshes) {
    const geometry = mesh.geometry, pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = geometry.getAttribute('color');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const owner = mesh.parent as THREE.Bone;
    const chain = mesh.userData.skinChain as THREE.Bone[] | undefined;
    const chainY = chain?.map(bone => bone.getWorldPosition(new THREE.Vector3()).y);
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();
      positions.push(p.x,p.y,p.z); normals.push(n.x,n.y,n.z); colors.push(color.getX(i),color.getY(i),color.getZ(i));
      let first = bones.indexOf(owner), second = first, blend = 0;
      if (mesh.userData.neckJoint) {
        // A shared surface bridges chest and neck. Favor the neck above
        // the shoulder while the deep brisket remains attached to the body.
        second = bones.indexOf(mesh.userData.neckJoint);
        blend = THREE.MathUtils.smoothstep(p.z, .18, .39)
          * THREE.MathUtils.smoothstep(p.y, .43, .61);
      }
      if (chain && chainY) {
        // The shoulder/hip surface stays attached to the torso while the
        // limb swings beneath it; a rigid proximal cap pokes through the back.
        first=bones.indexOf(body);second=bones.indexOf(chain[0]);
        blend=THREE.MathUtils.smoothstep(chainY[0]+.035-p.y,0,.115);
        // Narrow transition bands retain muscle volume while closing seams.
        for (let k=1;k<chain.length;k++) {
          const band = k === 1 ? .045 : .025;
          if (p.y < chainY[k] + band) {
            first = bones.indexOf(chain[k-1]); second = bones.indexOf(chain[k]);
            blend = THREE.MathUtils.smoothstep(chainY[k]+band-p.y,0,band*2);
          }
        }
      }
      indices.push(first,second,0,0); weights.push(1-blend,blend,0,0);
    }
    mesh.removeFromParent(); geometry.dispose();
  }
  geometries.length = 0;
  const skinGeometry = new THREE.BufferGeometry();
  skinGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  skinGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  skinGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  skinGeometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  skinGeometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  geometries.push(skinGeometry);
  const skin = new THREE.SkinnedMesh(skinGeometry,material); skin.name = 'gsp-surface'; skin.castShadow = true; skin.receiveShadow = true;
  const skeleton = new THREE.Skeleton(bones); root.add(skin); skin.bind(skeleton);
  // Runtime uses a conservative local envelope; do not reskin every vertex
  // on the CPU merely to update culling bounds each animation frame.
  if(live){skin.boundingBox=new THREE.Box3(new THREE.Vector3(-.8,-.4,-1),new THREE.Vector3(.8,1.3,1));skin.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.4,0),1.6);}
  const rest = Object.values(joints).map(node => ({ node, position: node.position.clone(), rotation: node.quaternion.clone() }));
  const setPose = (pose: 'stand' | 'point', presence = 1) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    if (pose === 'point') {
      const t = THREE.MathUtils.clamp(presence, 0, 1);
      // Reach through the neck with a nearly level muzzle and a lifted,
      // still tail. The feet remain controlled by the field contact solver.
      neck.rotation.x = .16 * t;
      head.rotation.x = -.16 * t;
      neck.position.z += .045 * t;
      // Keep the elbow bend on the same side as the gait/ground solver.
      // The former positive lower-arm fold forced a reversal during release.
      joints['front-left'].rotation.x = .40 * t;
      joints['front-left-lower'].rotation.x = -1.60 * t;
      joints['front-left-distal'].rotation.x = 1.90 * t;
      // Reference stance: the hind legs brace behind the pelvis rather
      // than stacking both paws under it. Slight asymmetry avoids a pose stamp.
      joints['hind-left'].rotation.x = .32 * t;
      joints['hind-right'].rotation.x = .22 * t;
      tail.rotation.x = .20 * t;
    }
    root.updateMatrixWorld(true); skeleton.update(); if(!live){skin.computeBoundingBox(); skin.computeBoundingSphere();}
  };
  const locomotion = createLocomotionPose(), solution = createTwoBoneSolution();
  const chains = paws.map(paw => {
    const distal = paw.parent as THREE.Bone, lower = distal.parent as THREE.Bone, upper = lower.parent as THREE.Bone;
    return { paw,distal,lower,upper,
      upperLength:lower.position.length(),lowerLength:distal.position.length(),distalLength:paw.position.length(),
      upperAngle:Math.atan2(lower.position.z,-lower.position.y),lowerAngle:Math.atan2(distal.position.z,-distal.position.y),distalAngle:Math.atan2(paw.position.z,-paw.position.y),
      footZ:lower.position.z+distal.position.z+paw.position.z,
    };
  });
  /** Ground-relative targets; travel must advance by the returned stride per cycle. */
  const setLocomotion = (gait: LocomotionGait, cycle: number) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    writeLocomotionPose(gait,cycle,'left',locomotion,1,gait==='gallop'?GENERATED_GALLOP_TOUCHDOWN:undefined);
    const strideScale=GENERATED_STRIDE_SCALE[gait];
    body.position.y = (gait==='walk'?-.035:gait==='gallop'?-.09:-.06) + locomotion.bodyY*.25;
    let clamped = 0;
    chains.forEach((leg,i) => {
      const foot=locomotion.feet[i], footY=.023+foot.lift;
      const shoulderTravel=i<2?locomotion.scapulaZ[i]*strideScale:0;
      leg.upper.position.z+=shoulderTravel;
      solveTwoBone(footY+leg.distalLength-leg.upper.position.y-body.position.y,leg.footZ+foot.z*strideScale-shoulderTravel,leg.upperLength,leg.lowerLength,i<2?-1:1,solution);
      if(solution.clamped)clamped++;
      leg.upper.rotation.x=leg.upperAngle-solution.upper;
      leg.lower.rotation.x=leg.lowerAngle-solution.lowerAbsolute-leg.upper.rotation.x;
      leg.distal.rotation.x=leg.distalAngle-leg.upper.rotation.x-leg.lower.rotation.x;
      leg.paw.rotation.x=-leg.upper.rotation.x-leg.lower.rotation.x-leg.distal.rotation.x;
    });
    neck.rotation.x=gait==='gallop'?.23:gait==='canter'?.17:.11;head.rotation.x=-.07;
    root.updateMatrixWorld(true);skeleton.update();if(!live){skin.computeBoundingBox();skin.computeBoundingSphere();}
    return {stride:locomotion.stride*strideScale,feet:locomotion.feet,clamped};
  };
  /** Submerged paddling targets: no stance phase or planted ground plane. */
  const setSwimming = (cycle: number) => {
    for (const {node,position,rotation} of rest) { node.position.copy(position); node.quaternion.copy(rotation); }
    body.position.y = -.025;
    let clamped = 0;
    chains.forEach((leg,i) => {
      const phase = (cycle + [0, .5, .58, .08][i]) * Math.PI * 2;
      const reach = Math.sin(phase) * (i < 2 ? .105 : .075);
      const footY = .14 + (1 + Math.cos(phase)) * .055;
      solveTwoBone(footY + leg.distalLength - leg.upper.position.y - body.position.y,
        leg.footZ + reach, leg.upperLength, leg.lowerLength, i < 2 ? -1 : 1, solution);
      if (solution.clamped) clamped++;
      leg.upper.rotation.x = leg.upperAngle - solution.upper;
      leg.lower.rotation.x = leg.lowerAngle - solution.lowerAbsolute - leg.upper.rotation.x;
      leg.distal.rotation.x = leg.distalAngle - leg.upper.rotation.x - leg.lower.rotation.x;
      leg.paw.rotation.x = -.18 * Math.sin(phase) - leg.upper.rotation.x - leg.lower.rotation.x - leg.distal.rotation.x;
    });
    neck.rotation.x = -.08; head.rotation.x = -.04;
    tail.rotation.x = -.08;
    root.updateMatrixWorld(true); skeleton.update();
    if (!live) { skin.computeBoundingBox(); skin.computeBoundingSphere(); }
    return clamped;
  };
  const hip=new THREE.Vector3(),wrist=new THREE.Vector3(),direction=new THREE.Vector3(),bendAxis=new THREE.Vector3(),elbow=new THREE.Vector3(),aim=new THREE.Vector3(),normalLocal=new THREE.Vector3();
  const inverse=new THREE.Quaternion(),parentWorld=new THREE.Quaternion(),desiredWorld=new THREE.Quaternion(),rootWorld=new THREE.Quaternion();
  const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
  /** Targets and normals are world-space; all limb joints retain their authored lengths. */
  const solveWorldFeet=(targets: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], posedFoot = -1)=>{
    root.updateMatrixWorld(true);body.getWorldQuaternion(parentWorld);inverse.copy(parentWorld).invert();root.getWorldQuaternion(rootWorld);
    let clamped=0;
    chains.forEach((leg,i)=>{
      if (i === posedFoot) return;
      hip.copy(leg.upper.position);
      wrist.copy(targets[i]).addScaledVector(normals[i],leg.distalLength);body.worldToLocal(wrist);
      direction.copy(wrist).sub(hip);const raw=direction.length();direction.normalize();
      const distance=THREE.MathUtils.clamp(raw,Math.abs(leg.upperLength-leg.lowerLength)+1e-5,leg.upperLength+leg.lowerLength-1e-5);
      if(Math.abs(distance-raw)>1e-5)clamped++;
      const along=(leg.upperLength**2-leg.lowerLength**2+distance**2)/(2*distance);
      const height=Math.sqrt(Math.max(0,leg.upperLength**2-along**2));
      bendAxis.copy(forward).addScaledVector(direction,-forward.dot(direction));if(bendAxis.lengthSq()<1e-8)bendAxis.copy(up);bendAxis.normalize();
      elbow.copy(direction).multiplyScalar(along).addScaledVector(bendAxis,(i<2?-1:1)*height);
      leg.upper.quaternion.setFromUnitVectors(aim.copy(leg.lower.position).normalize(),wrist.copy(elbow).normalize());
      aim.copy(direction).multiplyScalar(distance).sub(elbow).applyQuaternion(inverse.copy(leg.upper.quaternion).invert()).normalize();
      leg.lower.quaternion.setFromUnitVectors(bendAxis.copy(leg.distal.position).normalize(),aim);
      normalLocal.copy(normals[i]).applyQuaternion(inverse.copy(parentWorld).invert());
      inverse.copy(leg.upper.quaternion).multiply(leg.lower.quaternion).invert();
      aim.copy(normalLocal).negate().applyQuaternion(inverse);
      leg.distal.quaternion.setFromUnitVectors(bendAxis.copy(leg.paw.position).normalize(),aim);
      leg.distal.updateWorldMatrix(true,false);leg.distal.getWorldQuaternion(inverse).invert();
      desiredWorld.setFromUnitVectors(up,normals[i]).multiply(rootWorld);
      leg.paw.quaternion.copy(inverse).multiply(desiredWorld);
    });
    root.updateMatrixWorld(true);skeleton.update();if(!live){skin.computeBoundingBox();skin.computeBoundingSphere();}
    return clamped;
  };
  /** Lower the supported body only as far as required by finite limb reach. */
  const fitBodyToFeet=(targets:readonly THREE.Vector3[],normals:readonly THREE.Vector3[],posedFoot = -1)=>{
    root.updateMatrixWorld(true);let allowed=body.position.y;
    chains.forEach((leg,i)=>{
      if (i === posedFoot) return;
      wrist.copy(targets[i]).addScaledVector(normals[i],leg.distalLength);root.worldToLocal(wrist);
      // A supported torso may pitch or bank. Measure the actual hip in the
      // root frame rather than assuming that every shoulder stays upright.
      leg.upper.getWorldPosition(hip);root.worldToLocal(hip);
      const dx=wrist.x-hip.x,dz=wrist.z-hip.z;
      const length=leg.upperLength+leg.lowerLength-.006;
      const vertical=Math.sqrt(Math.max(0,length*length-dx*dx-dz*dz));
      allowed=Math.min(allowed,body.position.y+wrist.y+vertical-hip.y);
    });
    body.position.y=Math.max(-.14,allowed);root.updateMatrixWorld(true);return body.position.y;
  };
  setPose('stand');
  return { root, joints, paws, setPose, setLocomotion, setSwimming, solveWorldFeet, fitBodyToFeet, material, skin, skeleton,
    stats: { triangles: geometries.reduce((n,g) => n + g.getAttribute('position').count / 3,0), meshes: geometries.length, materials: 1, geometryBytes: geometries.reduce((n,g) => n + Object.values(g.attributes).reduce((s,a) => s + a.array.byteLength,0),0) },
    dispose() { geometries.forEach(g => g.dispose()); material.dispose(); skeleton.dispose(); root.removeFromParent(); },
  };
}
