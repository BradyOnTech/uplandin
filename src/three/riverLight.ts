import * as THREE from 'three';
import { exemptFromField, FIELD_UNIFORM } from './fieldConditions';

/**
 * A river seen from far above catches the sky: by Fresnel, the more
 * glancing the view the more of the sky's own colour it gives back, so from
 * a rim it reads as a pale ribbon down a dark gorge floor, and the sun's
 * glint comes and goes on it as the angle comes round. The sky is the one
 * wet ground reflects (fieldConditions.ts), so it follows the hour and the
 * weather. Running water takes none of the field's frost or snow.
 */
export function riverMaterial(): THREE.MeshPhongMaterial {
  const material = exemptFromField(new THREE.MeshPhongMaterial({
    color: 0x34504f, specular: 0xfff1d8, shininess: 240, emissive: 0x0b1416,
  }), 'water');
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#ifdef UPLAND_FIELD_LIT
	{
		// Schlick's Fresnel from water's 2%: the sky in the water.
		float riverFacing = clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 );
		float riverFresnel = .02 + .98 * pow( 1.0 - riverFacing, 5.0 );
		reflectedLight.indirectSpecular += ${FIELD_UNIFORM}[5].rgb * ( .12 + .88 * riverFresnel );
	}
#endif`);
  };
  material.customProgramCacheKey = () => 'upland-river-sky-v1';
  return material;
}
