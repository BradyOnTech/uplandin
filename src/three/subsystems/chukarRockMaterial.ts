import * as THREE from 'three';

/** World-space mineral staining across the large fracture planes. The broad
 * patches provide scale without a texture download or an extra render pass. */
export function applyChukarRockWeathering(material:THREE.MeshLambertMaterial):void {
  material.customProgramCacheKey=()=> 'chukar-fractured-rock-weathering-v1';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vChukarRockWorld;')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 rockPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        rockPosition=instanceMatrix*rockPosition;
        #endif
        vChukarRockWorld=(modelMatrix*rockPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vChukarRockWorld;
      float rockHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float rockNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),
          mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),
          mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=vChukarRockWorld;
        float mineral=rockNoise(p*.34);
        float runoff=rockNoise(p*vec3(.75,.12,.75)+mineral*.6);
        float grain=rockNoise(p*2.3);
        float resolved=1.-smoothstep(.25,.9,max(fwidth(p.x),max(fwidth(p.y),fwidth(p.z)))*2.3);
        vec3 patina=mix(vec3(.72,.80,.84),vec3(1.19,1.08,.88),smoothstep(.23,.77,mineral));
        diffuseColor.rgb*=patina*(.84+runoff*.29+(grain-.5)*.12*resolved);
      `)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*.15;');
  };
}
