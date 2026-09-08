#!/usr/bin/env node
/** Passive per-render-frame gait samples during ordinary walk-to-point input.
 * Same-frame pre-IK and solved markers use the inverse actual root quaternion.
 * No pose, clip, phase, simulation or contact state is written by this probe.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import puppeteer from 'puppeteer';
import { runNormalGameplay } from './playthrough.mjs';

const args=process.argv.slice(2),get=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const url=get('--url','http://localhost:4173'),out=resolve(get('--out','artifacts/3d/runtime-gait-audit'));
mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({headless:!args.includes('--headed'),args:[]});
try{
 const page=await browser.newPage();
 await page.evaluateOnNewDocument(()=>{
  window.__runtimeGaitFrames=[];
  const sample=()=>{
   if(window.__ready3d&&window.__dogAudit){const a=window.__dogAudit.state();
    if(a?.rootQuaternion&&a.paws?.every(p=>p.preIK)&&window.__runtimeGaitFrames.length<12000){
     window.__runtimeGaitFrames.push({ms:performance.now(),clip:a.clip,posture:a.posture,performance:a.performance,state:a.state,
      root:a.root,rootQuaternion:a.rootQuaternion,cycle:a.gallop.cycle,speed:a.gallop.speedMps,paws:a.paws});
    }
   }
   requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 });
 const hunt=await runNormalGameplay(page,{url,out,until:'point',video:false,maxSeconds:120,width:1280,height:720,quality:'high',drop:get('--drop','south-gate')});
 const frames=await page.evaluate(()=>window.__runtimeGaitFrames);
 if(!frames.length)throw Error('No same-frame pre-IK/solved samples; use a build with read-only preIK audit data.');
 writeFileSync(resolve(out,'runtime-frames.ndjson'),frames.map(f=>JSON.stringify(f)).join('\n')+'\n');
 const groups={};let lastClip='',entered=0;
 const vec=new THREE.Vector3(),inverse=new THREE.Quaternion();
 for(const frame of frames){
  if(frame.clip!==lastClip){lastClip=frame.clip;entered=frame.ms;}
  if(frame.ms-entered<250||!['walk','trot'].includes(frame.clip)||frame.speed<.1)continue;
  inverse.set(frame.rootQuaternion.x,frame.rootQuaternion.y,frame.rootQuaternion.z,frame.rootQuaternion.w).invert();
  const paws={};
  for(const p of frame.paws){
   const convert=point=>vec.set(point.x-frame.root.x,point.y-frame.root.y,point.z-frame.root.z).applyQuaternion(inverse).toArray();
   paws[p.foot]={pre:convert(p.preIK),post:convert(p),corrective:p.correctiveStep,settling:p.settlingStep};
  }
  (groups[frame.clip]??=[]).push({...frame,paws});
 }
 const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
 const correlation=(a,b)=>{const ma=mean(a),mb=mean(b);let cov=0,va=0,vb=0;for(let i=0;i<a.length;i++){cov+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2;}return cov/Math.sqrt(va*vb);};
 const ids=['FL','FR','HL','HR'];
 const report={evidence:'Same normal-play render frame before and after terrain/stance IK',
  limitations:['Functional gait diagnostic while other workstation jobs may be active; not standalone performance evidence.',
   'The first250ms after a clip switch are excluded; posture blends and normal turns remain visible.',
   'Brief asynchronous corrective replants do not alone establish a pacing gait. Unobserved clips remain unverified.'],
  sourceHunt:{result:hunt.result,browser:hunt.browser,applicationScripts:hunt.applicationScripts,options:hunt.options},
  frames:frames.length,clips:[]};
 for(const [name,samples] of Object.entries(groups)){
  const record={name,samples:samples.length,phaseBinsCovered:new Set(samples.map(s=>Math.floor(s.cycle*24)%24)).size,
   correctivePawSamples:samples.reduce((n,s)=>n+Object.values(s.paws).filter(p=>p.corrective).length,0),metrics:{}};
  for(const stage of ['pre','post']){
   const z=id=>samples.map(s=>s.paws[id][stage][2]);
   const bins=Array.from({length:24},(_,i)=>{const selected=samples.filter(s=>Math.floor(s.cycle*24)%24===i);return{phase:(i+.5)/24,samples:selected.length,paws:selected.length?Object.fromEntries(ids.map(id=>[id,mean(selected.map(s=>s.paws[id][stage][2]))])):null};});
   record.metrics[stage]={foreAftCorrelation:{FL_HR:correlation(z('FL'),z('HR')),FR_HL:correlation(z('FR'),z('HL')),FL_HL:correlation(z('FL'),z('HL')),FR_HR:correlation(z('FR'),z('HR'))},bins};
  }
  report.clips.push(record);
 }
 report.unobserved=['walk','trot'].filter(name=>!groups[name]?.length);
 writeFileSync(resolve(out,'runtime-gait.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,clips:report.clips.map(c=>({...c,metrics:Object.fromEntries(Object.entries(c.metrics).map(([stage,m])=>[stage,m.foreAftCorrelation]))}))},null,2));
}finally{await browser.close();}
