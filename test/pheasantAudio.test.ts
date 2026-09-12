import { afterEach, expect, it, vi } from 'vitest';
import { pheasantPowerStrokes, pheasantWingPhase } from '../src/three/pheasantWingMotion';
import { pheasantLaunchVoice, synthesizePheasantLaunch, PHEASANT_AUDIO_RATE } from '../src/three/pheasantFlushAudio';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});

it('separates fixed cover release from moving wings, bounds nodes, and releases both sources', async()=>{
  const nodes:any[]=[];
  const param=()=>({value:0,setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
  const node=(kind:string)=>{
    const n:any={kind,gain:param(),positionX:param(),positionY:param(),positionZ:param(),onended:null,
      connect:vi.fn((destination:any)=>destination),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};
    nodes.push(n);return n;
  };
  vi.stubGlobal('AudioContext',class {
    state='running';currentTime=0;destination={};
    createGain(){return node('gain');} createPanner(){return node('pan');}
    createBufferSource(){return node('source');}
    createBuffer(_channels:number,length:number,rate:number){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};}
  });
  const audio=await import('../src/audio');const sound=audio.playPheasantFlush(5,true,{x:4,y:0,z:0})!;
  const pans=nodes.filter(n=>n.kind==='pan');expect(pans).toHaveLength(2);
  for(const pan of pans){expect(pan.positionX.value).toBe(1);expect(pan.panningModel).toBe('HRTF');expect(pan.rolloffFactor).toBe(0);}
  const attenuation=nodes.find(n=>n.kind==='gain'&&n.connect.mock.calls[0]?.[0]===pans[0]);
  expect(attenuation.gain.value).toBeCloseTo(1/(1+5/18));
  sound.updateSpatial(36,{x:0,y:3,z:4});
  expect(pans[0].positionZ.setTargetAtTime).toHaveBeenLastCalledWith(.8,0,.025);
  expect(attenuation.gain.setTargetAtTime).toHaveBeenLastCalledWith(1/3,0,.025);
  expect(pans[1].positionZ.setTargetAtTime).not.toHaveBeenCalled();
  sound.updateCoverSpatial!(6,{x:-6,y:0,z:0});
  expect(pans[1].positionX.setTargetAtTime).toHaveBeenLastCalledWith(-1,0,.025);
  const sources=nodes.filter(n=>n.kind==='source').sort((a,b)=>a.buffer.duration-b.buffer.duration);
  expect(sources).toHaveLength(2);expect(nodes).toHaveLength(7); // Two mono sources, two HRTFs, three gains including master.
  sources[0].onended();expect(pans[1].disconnect).toHaveBeenCalledOnce();expect(sound.active).toBe(true);
  sound.updateCoverSpatial!(9,{x:0,y:0,z:1});expect(pans[1].positionX.setTargetAtTime).toHaveBeenCalledOnce();
  sources[1].onended();expect(pans[0].disconnect).toHaveBeenCalledOnce();expect(sound.active).toBe(false);
  expect(attenuation.disconnect).toHaveBeenCalledOnce();
  sound.stop();sound.updateSpatial(0,{x:1,y:0,z:0});
  expect(pans[0].disconnect).toHaveBeenCalledOnce();expect(pans[0].positionZ.setTargetAtTime).toHaveBeenCalledOnce();
  const stopped=audio.playPheasantFlush(5,false)!;stopped.stop();expect(stopped.active).toBe(false);
  audio.setAudioEnabled(false);expect(audio.playPheasantFlush(5,false)).toBeUndefined();
  expect(nodes.filter(n=>n.kind==='source')).toHaveLength(4);
});

it('times heavy wing pulses to downward drives of the rendered accelerating wingbeat',()=>{
  for(const phase of [0,.735,4.5]) {
    const times=pheasantPowerStrokes(9,phase);
    expect(times.length).toBeGreaterThan(12);expect(times.length).toBeLessThan(16);
    for(const time of times) expect(Math.cos(pheasantWingPhase(time,9,phase))).toBeCloseTo(-1,8);
    expect(times[1]-times[0]).toBeLessThan(times.at(-1)!-times.at(-2)!);
  }
  const samples=synthesizePheasantLaunch(false,{seed:83});
  const energy=(center:number)=>{
    let sum=0;const start=Math.floor((center-.008)*PHEASANT_AUDIO_RATE),end=Math.floor((center+.008)*PHEASANT_AUDIO_RATE);
    for(let i=start;i<end;i++)sum+=samples.flight[i]**2;
    return sum/(end-start);
  };
  const beats=pheasantPowerStrokes(9);
  for(let i=0;i<6;i++)expect(energy(beats[i])).toBeGreaterThan(energy((beats[i]+beats[i+1])*.5)*3);
});

it('varies calling roosters without changing hen voices or consuming simulation randomness',()=>{
  const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('No shared random stream');});
  try {
    const voices=Array.from({length:40},(_,seed)=>pheasantLaunchVoice(seed,true));
    expect(voices.some(v=>v.calls===0)).toBe(true);expect(voices.some(v=>v.calls===2)).toBe(true);expect(voices.some(v=>v.calls===3)).toBe(true);
    for(let seed=0;seed<8;seed++){
      expect(pheasantLaunchVoice(seed,false).calls).toBe(0);
      const a=synthesizePheasantLaunch(true,{seed}),b=synthesizePheasantLaunch(true,{seed});
      expect(a.flight).toEqual(b.flight);expect(a.cover).toEqual(b.cover);
      expect(Array.from(a.flight).every(v=>Number.isFinite(v)&&Math.abs(v)<1)).toBe(true);
      expect(a.flight[0]).toBeCloseTo(0,5);expect(a.flight.at(-1)).toBeCloseTo(0,5);
      expect(a.cover[0]).toBeCloseTo(0,5);expect(a.cover.at(-1)).toBeCloseTo(0,5);
    }
  } finally {random.mockRestore();}
});
