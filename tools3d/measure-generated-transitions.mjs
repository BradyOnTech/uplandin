import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args=process.argv.slice(2), index=args.indexOf('--out');
const out=resolve(index>=0?args[index+1]:'docs/3d/art-direction-refresh/dog/motion-transitions/measured');
mkdirSync(out,{recursive:true});
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const { GeneratedFieldMotion }=await server.ssrLoadModule('/src/three/dogs/generatedFieldMotion.ts');
  const rows=[];
  for(const speed of [.6,1.8,3.2,5.6]) for(const scenario of ['start-from-point','stop-into-point']) {
    const motion=new GeneratedFieldMotion('lite',()=>0); let z=0;
    for(let i=0;i<150;i++) {
      if(scenario==='stop-into-point')z+=speed/60;
      motion.update(0,z,0,1/60,scenario==='stop-into-point',scenario==='start-from-point');
    }
    let previous=motion.asset.paws.map(p=>p.getWorldPosition(p.position.clone()));
    let worst=0,first=0,clamps=0,worstFrame=0;
    for(let i=0;i<30;i++) {
      if(scenario==='start-from-point')z+=speed/60;
      motion.update(0,z,0,1/60,scenario==='start-from-point',scenario==='stop-into-point');
      const actual=motion.asset.paws.map(p=>p.getWorldPosition(p.position.clone()));
      const delta=Math.max(...actual.map((p,j)=>p.distanceTo(previous[j])));
      if(i===0)first=delta;
      if(delta>worst){worst=delta;worstFrame=i;}
      previous=actual;clamps+=motion.clamped;
    }
    rows.push({scenario,speed,firstFramePawDisplacement:first,worstFramePawDisplacement:worst,worstFrame,clamps});
    motion.dispose();
  }
  writeFileSync(resolve(out,'report.json'),JSON.stringify({evidence:'Synthetic 60 Hz abrupt transition stress cases; not observed gameplay or natural acceleration',rows},null,2)+'\n');
  console.log(JSON.stringify(rows,null,2));
} finally { await server.close(); }
