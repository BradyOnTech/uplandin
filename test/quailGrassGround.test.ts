import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { quailGrassClumpGeometry } from '../src/three/subsystems/quailGrass';
import { applyQuailGrassGroundLod, createQuailGrassGroundGeometry } from '../src/three/subsystems/quailGrassGround';
import { quailGroundNearDistance, quailGroundUsesNear } from '../src/three/subsystems/quailGroundGeometry';

function shaderSource() {
  return {
    vertexShader: THREE.ShaderLib.lambert.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += position.y * 0.02;'),
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    uniforms: {},
  } as THREE.WebGLProgramParametersWithUniforms;
}

describe('Quail grass ground LOD', () => {
  it('shares every leaf and index buffer across batches while keeping their instance data and bounds separate', () => {
    const source = quailGrassClumpGeometry(true);
    source.setIndex(Array.from({ length: source.getAttribute('position').count }, (_, i) => i));
    source.addGroup(0, source.index!.count, 0); source.setDrawRange(3, 9);
    const aData = new Float32Array([.1269, 64, 192, -.08, 64, 320]);
    const bData = new Float32Array([.045, 192, 192]);
    const a = createQuailGrassGroundGeometry(source, aData), b = createQuailGrassGroundGeometry(source, bData);
    expect(a).not.toBe(source); expect(a.attributes).not.toBe(source.attributes);
    for (const [name, attribute] of Object.entries(source.attributes)) {
      expect(a.getAttribute(name)).toBe(attribute); expect(b.getAttribute(name)).toBe(attribute);
      expect(a.getAttribute(name).array).toBe(attribute.array);
    }
    expect(a.index).toBe(source.index); expect(b.index).toBe(source.index);
    const ag = a.getAttribute('quailInstanceGround') as THREE.InstancedBufferAttribute;
    const bg = b.getAttribute('quailInstanceGround') as THREE.InstancedBufferAttribute;
    expect(ag.isInstancedBufferAttribute).toBe(true); expect(ag.meshPerAttribute).toBe(1);
    expect(ag.itemSize).toBe(3); expect(ag.count).toBe(2); expect(bg.count).toBe(1);
    expect(ag.array).toBe(aData); expect(bg.array).toBe(bData);
    aData[0] = -.1; expect(ag.getX(0)).toBeCloseTo(-.1);
    expect(source.getAttribute('quailInstanceGround')).toBeUndefined();
    expect(a.boundingBox).toEqual(source.boundingBox); expect(a.boundingBox).not.toBe(source.boundingBox);
    expect(a.boundingSphere).toEqual(source.boundingSphere); expect(a.boundingSphere).not.toBe(source.boundingSphere);
    const originalRadius = source.boundingSphere!.radius;
    a.boundingSphere!.radius += .1269; expect(source.boundingSphere!.radius).toBe(originalRadius);
    expect(a.groups).toEqual(source.groups); expect(a.groups[0]).not.toBe(source.groups[0]);
    expect(a.drawRange).toEqual(source.drawRange); expect(a.userData).toEqual(source.userData);
    expect(a.userData).not.toBe(source.userData);
    a.dispose(); b.dispose(); source.dispose();
  });

  it('rejects incomplete instance rows instead of exposing an invalid divisor count', () => {
    const source = new THREE.BufferGeometry();
    expect(() => createQuailGrassGroundGeometry(source, new Float32Array(4))).toThrow('three floats');
    expect(createQuailGrassGroundGeometry(source, new Float32Array(0)).getAttribute('quailInstanceGround').count).toBe(0);
    source.dispose();
  });

  it.each(['high', 'lite'] as const)('uses the terrain tile cutoff exactly, including equality, in %s', (quality) => {
    const shader = shaderSource(), threshold = quailGroundNearDistance(quality);
    applyQuailGrassGroundLod(shader, threshold);
    expect(shader.uniforms.uQuailGrassGroundNearDistance.value).toBe(threshold);
    // Read the actual injected shader condition so a comparison/coordinate
    // regression fails here; threshold values also come from the terrain API.
    const condition = shader.vertexShader.match(/if \(length\(([^)]+)\)\s*(>=|>|<=|<)\s*uQuailGrassGroundNearDistance\)/);
    expect(condition).not.toBeNull();
    expect(condition![1]).toBe('quailInstanceGround.yz - cameraPosition.xz');
    const choosesFar = new Function('distance', 'cutoff', `return distance ${condition![2]} cutoff;`) as (distance: number, cutoff: number) => boolean;
    for (const sign of [-1, 1]) for (const distance of [threshold - .0001, threshold, threshold + .0001]) {
      const centerX = 64, centerZ = 192, cameraX = centerX + sign * distance;
      expect(choosesFar(Math.hypot(centerX - cameraX, 0), threshold))
        .toBe(!quailGroundUsesNear(centerX, centerZ, cameraX, centerZ, threshold));
    }
    expect(choosesFar(threshold, threshold)).toBe(true);
  });

  it('applies the same vertical shift after instance slope/scale in projection and receiver shadows', () => {
    const shader = shaderSource(), fragment = shader.fragmentShader;
    applyQuailGrassGroundLod(shader, 145);
    const source = shader.vertexShader;
    expect(source).toContain('transformed.x += position.y * 0.02;');
    expect(source).toContain('#include <defaultnormal_vertex>');
    expect(shader.fragmentShader).toBe(fragment);
    expect(source).not.toContain('#include <project_vertex>');
    expect(source).not.toContain('#include <worldpos_vertex>');
    const projectShift = source.indexOf('mvPosition.y += quailGrassGroundShift;');
    const worldShift = source.indexOf('worldPosition.y += quailGrassGroundShift;');
    expect(projectShift).toBeGreaterThan(source.indexOf('mvPosition = instanceMatrix * mvPosition;'));
    expect(projectShift).toBeLessThan(source.indexOf('mvPosition = modelViewMatrix * mvPosition;'));
    expect(worldShift).toBeGreaterThan(source.indexOf('worldPosition = instanceMatrix * worldPosition;'));
    expect(worldShift).toBeLessThan(source.indexOf('worldPosition = modelMatrix * worldPosition;'));
    expect(worldShift).toBeLessThan(source.indexOf('#include <shadowmap_vertex>'));
    expect(source).toContain('quailGrassGroundShift = quailInstanceGround.x;');
    expect(source.match(/quailGrassGroundShift = 0\.0;/g)).toHaveLength(1);
  });
});
