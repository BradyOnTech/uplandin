import * as THREE from 'three';
type Source={positions:number[][];colors:number[][];wind:number[][];indices:number[][]};
function angleDifference(a:number,b:number){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))}
export function nativeOpaqueFamily(source:Source){
 const selected:number[]=[],middleSelected:number[]=[],crownAudit:any[]=[];
 for(let crown=0;crown<9;crown++){
  const leaves=Array.from({length:24},(_,j)=>{const id=crown*24+j,root=source.positions[id*18+1],tip=source.positions[id*18+16],height=Math.max(...source.positions.slice(id*18,id*18+18).map(p=>p[1]));return{id,height,angle:Math.atan2(tip[0]-root[0],tip[2]-root[2]),reach:Math.hypot(tip[0]-root[0],tip[2]-root[2]),basal:j%6===0}});
  const tall=leaves.filter(l=>!l.basal),chosen=[tall.reduce((a,b)=>a.height>b.height?a:b)];
  for(let i=1;i<4;i++){
   const candidates=tall.filter(l=>!chosen.includes(l));candidates.sort((a,b)=>{const score=(l:typeof a)=>Math.min(...chosen.map(c=>angleDifference(c.angle,l.angle)))*(.72+l.height*1.1);return score(b)-score(a)});chosen.push(candidates[0]);
  }
  const lows=leaves.filter(l=>l.basal);lows.sort((a,b)=>b.reach-a.reach);chosen.push(lows[0]);selected.push(...chosen.map(l=>l.id));
  const medium=[...chosen];
  // Retain the coarse envelope, then fill the greatest azimuth/height gaps.
  // This selects original blades, without stretching or thickening them.
  while(medium.length<12){
   const candidates=leaves.filter(l=>!medium.includes(l));
   candidates.sort((a,b)=>{const score=(l:typeof a)=>Math.min(...medium.map(c=>Math.hypot(angleDifference(c.angle,l.angle)/Math.PI,(c.height-l.height)/.37,(c.reach-l.reach)/.45)));return score(b)-score(a)});
   medium.push(candidates[0]);
  }
  middleSelected.push(...medium.map(l=>l.id));crownAudit.push({crown,selected:chosen,middle:medium});
 }
 const keep=new Set(selected),mediumKeep=new Set(middleSelected),p:number[]=[],color:number[]=[],uv:number[]=[],bend:number[]=[],rootAttr:number[]=[],extra:number[]=[],coarseIndices:number[]=[],middleIndices:number[]=[],middleExtraIndices:number[]=[],nearExtraIndices:number[]=[],index:number[]=[];let reductionError=0;
 for(let leaf=0;leaf<216;leaf++){
  let bestK=2,bestError=Infinity;
  for(const knot of[2,3]){let error=0;for(let segment=1;segment<5;segment++){const a=segment<=knot?0:knot,b=segment<=knot?knot:5,t=(segment-a)/(b-a),v=new THREE.Vector3(...source.positions[leaf*18+segment*3+1] as [number,number,number]);const q=new THREE.Vector3(...source.positions[leaf*18+a*3+1] as [number,number,number]).lerp(new THREE.Vector3(...source.positions[leaf*18+b*3+1] as [number,number,number]),t);error=Math.max(error,v.distanceTo(q))}if(error<bestError){bestK=knot;bestError=error}}
  reductionError=Math.max(reductionError,bestError);const start=p.length/3,three=leaf%2===0,root=source.positions[leaf*18+1];
  const vertices=three?[[0,0],[0,2],[bestK,0],[bestK,2],[5,1]]:[[0,1],[bestK,0],[bestK,2],[5,1]];
  for(const[segment,edge]of vertices){const si=leaf*18+segment*3+edge;p.push(...source.positions[si]);color.push(...source.colors[si].slice(0,3));uv.push(...source.wind[si]);bend.push(Math.max(0,source.positions[si][1]/.37)**2);rootAttr.push(...root);extra.push(keep.has(leaf)?0:mediumKeep.has(leaf)?1:2)}
  const faces=three?[start,start+1,start+2,start+1,start+3,start+2,start+2,start+3,start+4]:[start,start+1,start+2,start+1,start+3,start+2];index.push(...faces);if(keep.has(leaf))coarseIndices.push(...faces);if(mediumKeep.has(leaf))middleIndices.push(...faces);if(!keep.has(leaf)&&mediumKeep.has(leaf))middleExtraIndices.push(...faces);if(!mediumKeep.has(leaf))nearExtraIndices.push(...faces);
 }
 const detail=new THREE.BufferGeometry();for(const[name,array,size]of[['position',p,3],['color',color,3],['uv',uv,2],['studyBend',bend,1],['studyRoot',rootAttr,3],['studyExtra',extra,1]]as const)detail.setAttribute(name,new THREE.Float32BufferAttribute(array,size));detail.setIndex(index);detail.computeVertexNormals();
 const normals=detail.getAttribute('normal');for(let i=0;i<normals.count;i++){const n=new THREE.Vector3(normals.getX(i),Math.abs(normals.getY(i)),normals.getZ(i)).multiplyScalar(.2).add(new THREE.Vector3(0,.8,0)).normalize();normals.setXYZ(i,n.x,n.y,n.z)}detail.computeBoundingSphere();
 function subset(indices:number[]){const g=new THREE.BufferGeometry();for(const[name,attribute]of Object.entries(detail.attributes)){const values:number[]=[];for(const i of indices)for(let j=0;j<attribute.itemSize;j++)values.push(attribute.array[i*attribute.itemSize+j]);g.setAttribute(name,new THREE.Float32BufferAttribute(values,attribute.itemSize))}g.computeBoundingSphere();return g}
 const coarse=subset(coarseIndices),middle=subset(middleIndices),middleExtra=subset(middleExtraIndices),nearExtra=subset(nearExtraIndices);
 const audit={selectedLeaves:selected.length,middleSelectedLeaves:middleSelected.length,totalLeaves:216,coarseTriangles:coarseIndices.length/3,middleTriangles:middleIndices.length/3,middleExtraTriangles:middleExtraIndices.length/3,nearExtraTriangles:nearExtraIndices.length/3,detailTriangles:index.length/3,reductionErrorM:reductionError,crowns:crownAudit,coarseSurvivorsExactlyShared:true,extraLeavesCollapseAtOwnSourceRoot:true};
 return{coarse,middle,middleExtra,nearExtra,detail,audit};
}
