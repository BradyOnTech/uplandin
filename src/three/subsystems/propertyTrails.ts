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
  private detailMesh?: THREE.Mesh;
  private detailGeometry?: THREE.BufferGeometry;
  private detailMaterial?: THREE.MeshLambertMaterial;

  constructor(private readonly landscape: LandscapeModel) {}

  init(ctx: Ctx): void {
    const doctrine = huntingDoctrine(this.landscape.area.id);
    const areaId = this.landscape.area.id;
    // The route surface is part of the property's land-use story. Sharptail
    // lanes are faint two-track grass roads across a huge prairie; Valley
    // Oak lanes are darker, softer foot-and-stock paths under the trees. The
    // shared ribbon geometry keeps both tiers cheap while these small
    // material differences prevent every open-country map from inheriting
    // the same tan access road.
    const width = areaId === 'sharptail-prairie' ? 1.55
      : areaId === 'valley-oaks' ? 1.78
        : doctrine.style === 'woods' || doctrine.style === 'bottoms' ? 1.7
          : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? 2.35
            : doctrine.style === 'alpine-edge' ? 1.9 : 2.05;
    const color = areaId === 'sharptail-prairie' ? 0x81775b
      : areaId === 'valley-oaks' ? 0x62543b
        : doctrine.style === 'woods' || doctrine.style === 'bottoms' ? 0x48513e
          : doctrine.style === 'desert-wash' || doctrine.style === 'canyon' ? 0x806b4d
            : doctrine.style === 'alpine-edge' ? 0x596157 : 0x75684c;
    const opacity = areaId === 'sharptail-prairie' ? .58
      : areaId === 'valley-oaks' ? .68 : .78;
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const tint = new THREE.Color(color);
    const sample = { height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 };
    let vertex = 0;
    for (const trail of this.landscape.area.trails) {
      if (trail.points.length < 2) continue;
      const worldPoints = trail.points.map((point) => ({
        x: (point.x - this.landscape.dropPoint.position.x) * PROPERTY_PX_TO_M,
        z: (point.y - this.landscape.dropPoint.position.y) * PROPERTY_PX_TO_M + 40,
        y: this.landscape.heightAtProperty(point.x, point.y) + .012,
      }));
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
        return { x: normalX * width * miter, z: normalZ * width * miter };
      });
      for (let i = 0; i < worldPoints.length; i++) {
        const point = worldPoints[i], normal = normals[i];
        positions.push(point.x - normal.x, point.y, point.z - normal.z, point.x + normal.x, point.y, point.z + normal.z);
        const areaPoint = trail.points[i];
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
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `${this.landscape.area.name} worn routes`;
    this.mesh.receiveShadow = true;
    ctx.scene.add(this.mesh);

    // Sharptail prairie is crossed by long vehicle and stock lanes. A pair
    // of broken, low-contrast wheel ruts gives those lanes a physical scale
    // and makes the open-country strategy readable from the ground. Keep the
    // detail as one cheap mesh and only author it for this map: woodland and
    // wet-bottom routes should remain single footpaths, while chukar and
    // canyon routes already have their own contour surfaces.
    if (areaId === 'sharptail-prairie') {
      const detailPositions: number[] = [];
      const detailIndices: number[] = [];
      let detailVertex = 0;
      const trackOffset = 0.64;
      const trackHalfWidth = 0.095;
      for (const trail of this.landscape.area.trails) {
        if (trail.points.length < 2) continue;
        const worldPoints = trail.points.map((point) => ({
          x: (point.x - this.landscape.dropPoint.position.x) * PROPERTY_PX_TO_M,
          z: (point.y - this.landscape.dropPoint.position.y) * PROPERTY_PX_TO_M + 40,
          y: this.landscape.heightAtProperty(point.x, point.y) + 0.032,
        }));
        for (let i = 1; i < worldPoints.length; i++) {
          const a = worldPoints[i - 1];
          const b = worldPoints[i];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (length < 0.5) continue;
          const nx = -dz / length;
          const nz = dx / length;
          for (const side of [-1, 1]) {
            const cx = nx * trackOffset * side;
            const cz = nz * trackOffset * side;
            const tx = (dx / length) * trackHalfWidth;
            const tz = (dz / length) * trackHalfWidth;
            detailPositions.push(
              a.x + cx - tx, a.y, a.z + cz - tz,
              a.x + cx + tx, a.y, a.z + cz + tz,
              b.x + cx - tx, b.y, b.z + cz - tz,
              b.x + cx + tx, b.y, b.z + cz + tz,
            );
            detailIndices.push(
              detailVertex, detailVertex + 1, detailVertex + 2,
              detailVertex + 1, detailVertex + 3, detailVertex + 2,
            );
            detailVertex += 4;
          }
        }
      }
      if (detailVertex > 0) {
        this.detailGeometry = new THREE.BufferGeometry();
        this.detailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(detailPositions, 3));
        this.detailGeometry.setIndex(detailIndices);
        this.detailGeometry.computeVertexNormals();
        this.detailMaterial = new THREE.MeshLambertMaterial({
          color: 0x5f5946,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          side: THREE.DoubleSide,
        });
        this.detailMesh = new THREE.Mesh(this.detailGeometry, this.detailMaterial);
        this.detailMesh.name = `${this.landscape.area.name} paired wheel ruts`;
        this.detailMesh.renderOrder = 2;
        ctx.scene.add(this.detailMesh);
      }
    }
  }

  update(_ctx: Ctx): void { /* static */ }

  dispose(ctx: Ctx): void {
    if (this.mesh) ctx.scene.remove(this.mesh);
    this.geometry?.dispose(); this.material?.dispose();
    if (this.detailMesh) ctx.scene.remove(this.detailMesh);
    this.detailGeometry?.dispose(); this.detailMaterial?.dispose();
    this.mesh = undefined; this.geometry = undefined; this.material = undefined;
    this.detailMesh = undefined; this.detailGeometry = undefined; this.detailMaterial = undefined;
  }
}
