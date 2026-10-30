import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIELD_EXEMPT, FIELD_UNIFORM } from '../src/three/fieldConditions';
import { riverMaterial } from '../src/three/riverLight';

describe('a river far below', () => {
  it('gives back the field\'s sky by Fresnel and takes none of its snow', () => {
    const river = riverMaterial();
    try {
      expect(river.defines?.[FIELD_EXEMPT]).toBe('');
      expect(river.userData.fieldExempt).toBe('water');
      const shader = { fragmentShader: THREE.ShaderLib.phong.fragmentShader, vertexShader: '', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
      river.onBeforeCompile(shader, undefined as never);
      expect(shader.fragmentShader).toContain(`${FIELD_UNIFORM}[5].rgb`);
      expect(shader.fragmentShader.indexOf('riverFresnel')).toBeGreaterThan(shader.fragmentShader.indexOf('#include <lights_fragment_end>'));
    } finally { river.dispose(); }
  });
});
