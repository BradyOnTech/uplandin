import * as THREE from 'three';
import { PROPERTY_PX_TO_M, type LandscapeModel } from '../../game/landscape';
import { huntingDoctrine } from '../../game/huntDoctrine';
import type { Ctx, Subsystem } from '../engine';

/** Terrain-following ribbons make the authored route legible at a glance. */
export class PropertyTrailsSystem implements Subsystem {
  readonly id = 'property-trails';
  private mesh?: THREE.Mesh;
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.MeshLambertMaterial;

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const doctrine = huntingDoctrine(this.landscape.area.id);
    const areaId = this.landscape.area.id;
    const prairie = areaId === 'sharptail-prairie';
    // The route surface is part of the property's land-use story. Sharptail
    // lanes are faint two-track grass roads across a huge prairie; Valley
    // Oak lanes are darker, softer foot-and-stock paths under the trees. The
    // shared ribbon geometry keeps both tiers cheap while these small
    // material differences prevent every open-country map from inheriting
    // the same tan access road.
    const width = prairie ? 1.42
      : areaId === 'valley-oaks' ? 1.78
        : doctrine.style === 'woods' || doctrine.style === 'bottoms' ? 1.7
          : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? 2.35
            : doctrine.style === 'alpine-edge' ? 1.9 : 2.05;
    const color = prairie ? 0x99947a
      : areaId === 'valley-oaks' ? 0x62543b
        : doctrine.style === 'woods' || doctrine.style === 'bottoms' ? 0x48513e
          : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? 0x806b4d
            : doctrine.style === 'alpine-edge' ? 0x596157 : 0x75684c;
    const opacity = areaId === 'pheasant-coverts' ? .46 : prairie ? .42
      : areaId === 'valley-oaks' ? .68 : .78;
    const positions: number[] = [], colors: number[] = [], indices: number[] = [], edges: number[] = [];
    const routeSurface: number[] = [];
    const tint = new THREE.Color(color);
    const sample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
    let vertex = 0;
    for (const trail of this.landscape.area.trails) {
      if (trail.points.length < 2) continue;
      const worldPoints = this.sampleTrail(trail.points);
      // Distance stays tied to the authored route from either parking place.
      // Only prairie uses it: all other maps retain their original vertices.
      const distances: number[] = [0];
      if (prairie) for (let i = 1; i < worldPoints.length; i++) {
        distances.push(distances[i - 1] + Math.hypot(
          worldPoints[i].x - worldPoints[i - 1].x,
          worldPoints[i].z - worldPoints[i - 1].z,
        ));
      }
      const phase = trail.points[0].x * .043 + trail.points[0].y * .067;
      const normals = worldPoints.map((_point, index) => {
        const before = worldPoints[Math.max(0, index - 1)];
        const after = worldPoints[Math.min(worldPoints.length - 1, index + 1)];
        const prevX = worldPoints[index].x - before.x;
        const prevZ = worldPoints[index].z - before.z;
        const nextX = after.x - worldPoints[index].x;
        const nextZ = after.z - worldPoints[index].z;
        const prevLength = Math.hypot(prevX, prevZ) || 1;
        const nextLength = Math.hypot(nextX, nextZ) || 1;
        let tangentX = prevX / prevLength + nextX / nextLength;
        let tangentZ = prevZ / prevLength + nextZ / nextLength;
        const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
        tangentX /= tangentLength;
        tangentZ /= tangentLength;
        const normalX = -tangentZ;
        const normalZ = tangentX;
        // A sharp corner needs a little more width to avoid a pinched join,
        // but cap the miter so a tight authored switchback cannot grow a
        // triangular spike across the terrain.
        const segmentX = index === worldPoints.length - 1 ? prevX : nextX;
        const segmentZ = index === worldPoints.length - 1 ? prevZ : nextZ;
        const segmentLength = Math.hypot(segmentX, segmentZ) || 1;
        const segmentNormalX = -segmentZ / segmentLength;
        const segmentNormalZ = segmentX / segmentLength;
        const alignment = Math.abs(normalX * segmentNormalX + normalZ * segmentNormalZ);
        const miter = Math.min(1.65, 1 / Math.max(.58, alignment));
        const halfWidth = prairie ? width * (1 + .055 * Math.sin(distances[index] * .29 + phase)
          + .08 * Math.sin(distances[index] * .071 + phase * .61)) : width;
        return { x: normalX * halfWidth * miter, z: normalZ * halfWidth * miter, halfWidth };
      });
      for (let i = 0; i < worldPoints.length; i++) {
        const point = worldPoints[i], normal = normals[i];
        for (const side of [-1, 1]) {
          const x = point.x + normal.x * side, z = point.z + normal.z * side;
          positions.push(x, this.landscape.heightAtWorld(x, z) + .035, z);
          edges.push(side);
          if (prairie) routeSurface.push(normal.halfWidth * side, distances[i] + phase);
        }
        const areaPoint = this.landscape.worldToProperty(point.x, point.z, { x: 0, y: 0 });
        const wet = this.landscape.surfaceAtProperty(areaPoint.x, areaPoint.y, sample).moisture;
        const pointTint = tint.clone().lerp(new THREE.Color(0x5b6046), wet * .22);
        for (let p = 0; p < 2; p++) colors.push(pointTint.r, pointTint.g, pointTint.b);
        if (i > 0) {
          const start = vertex - 2;
          indices.push(start, start + 1, vertex, start + 1, vertex + 1, vertex);
        }
        vertex += 2;
      }
    }
    if (vertex === 0) return;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setAttribute('routeEdge', new THREE.Float32BufferAttribute(edges, 1));
    if (prairie) this.geometry.setAttribute('routeSurface', new THREE.Float32BufferAttribute(routeSurface, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    if (prairie) this.material.forceSinglePass = true;
    this.material.customProgramCacheKey = () => prairie ? 'property-route-prairie-wheel-wear-v1'
      : `property-route-soft-shoulder-v2-${areaId === 'pheasant-coverts'}`;
    this.material.onBeforeCompile = shader => {
      if (prairie) {
        // One existing ribbon carries both worn wheels. A clear center lets
        // the actual ground and short grass show through; there is no solid
        // road bed or second, razor-edged rut mesh. Metre-scale irregularity
        // is static and derivative-filtered before fading into the distance.
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 routeSurface; varying vec2 vRouteSurface; varying vec2 vRouteWorld;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRouteSurface = routeSurface; vRouteWorld = (modelMatrix * vec4(position, 1.0)).xz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vRouteSurface; varying vec2 vRouteWorld;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float routeAlong = vRouteSurface.y;
            float routeSide = sign(vRouteSurface.x);
            float wander = sin(routeAlong * .31) * .025 + sin(routeAlong * .79) * .01;
            float wheelDistance = abs(abs(vRouteSurface.x - wander) - .60);
            float wheelWidth = .105 + sin(routeAlong * .49 + routeSide * 2.3) * .025;
            float routeAA = min(.22, fwidth(vRouteSurface.x) * 1.5);
            float wheel = 1.0 - smoothstep(wheelWidth, wheelWidth + .13 + routeAA, wheelDistance);
            float brokenWear = smoothstep(-.65, .6,
              sin(routeAlong * .38 + routeSide * 1.7)
              + .5 * sin(routeAlong * .91 + routeSide * 2.4)
              + .35 * sin(routeAlong * .12 + 1.8));
            float routeDistance = length(vRouteWorld - cameraPosition.xz);
            float distanceFade = 1.0 - smoothstep(45.0, 145.0, routeDistance);
            diffuseColor.a *= wheel * brokenWear * .62 * distanceFade;
            diffuseColor.rgb *= .97 + .03 * sin(routeAlong * .52 + routeSide);
          `);
        return;
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float routeEdge; varying float vRouteEdge; varying vec2 vRouteWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRouteEdge = routeEdge; vRouteWorld = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRouteEdge; varying vec2 vRouteWorld;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float shoulder = abs(vRouteEdge) + sin(vRouteWorld.x * 2.1 + sin(vRouteWorld.y * 1.7)) * .07;
          diffuseColor.a *= 1.0 - smoothstep(.5, 1.0, shoulder);
          ${areaId === 'pheasant-coverts' ? `
          // Wheel wear belongs inside the existing farm lane. The center
          // and soft shoulders retain more of the underlying grass color.
          float wander = sin(vRouteWorld.x * .31 + vRouteWorld.y * .23) * .016;
          float wheelDistance = abs(abs(vRouteEdge + wander) - .43);
          float wheelWear = 1.0 - smoothstep(.065, .15, wheelDistance);
          float brokenWear = .78 + .22 * sin(vRouteWorld.x * 1.9 + vRouteWorld.y * 1.3);
          diffuseColor.a *= .18 + wheelWear * brokenWear * 2.0;
          diffuseColor.rgb *= mix(1.0, .83, wheelWear);
          ` : ''}
          diffuseColor.rgb *= .97 + .06 * sin(vRouteWorld.x * 3.7) * sin(vRouteWorld.y * 4.1);
        `);
    };
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `${this.landscape.area.name} worn routes`;
    this.mesh.receiveShadow = true;
    ctx.scene.add(this.mesh);
  }

  /** Sample both long grades and cross-slope shoulders instead of bridging
   * a hundred metres of terrain with one flat quad. */
  private sampleTrail(points: readonly { x: number; y: number }[]): { x: number; z: number }[] {
    const sampled: { x: number; z: number }[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const distance = Math.hypot(b.x - a.x, b.y - a.y) * PROPERTY_PX_TO_M;
      if (distance < .001) continue;
      const steps = Math.ceil(distance / 1.5);
      for (let step = sampled.length ? 1 : 0; step <= steps; step++) {
        const t = step / steps;
        sampled.push(this.landscape.propertyToWorld(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, { x: 0, z: 0 }));
      }
    }
    return sampled;
  }

  update(_ctx: Ctx): void { /* static */ }

  dispose(ctx: Ctx): void {
    if (this.mesh) ctx.scene.remove(this.mesh);
    this.geometry?.dispose(); this.material?.dispose();
    this.mesh = undefined; this.geometry = undefined; this.material = undefined;
  }
}
