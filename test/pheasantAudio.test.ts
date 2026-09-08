import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('routes the complete pheasant flush through one spatial HRTF node and releases it last', async()=>{
  const nodes:any[]=[];
  const param=()=>({value:0,setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
  const node=(kind:string)=>{
    const n:any={kind,gain:param(),frequency:param(),positionX:param(),positionY:param(),positionZ:param(),onended:null,stopAt:0,
      connect:vi.fn((destination:any)=>destination),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn((time:number)=>{n.stopAt=time;})};
    nodes.push(n);return n;
  };
  vi.stubGlobal('AudioContext',class {
    state='running';currentTime=0;sampleRate=100;destination={};
    createGain(){return node('gain');} createPanner(){return node('pan');}
    createOscillator(){return node('tone');}createBiquadFilter(){return node('filter');}
    createBufferSource(){return node('noise');}
    createBuffer(_channels:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
  });
  const audio=await import('../src/audio');const sound=audio.playPheasantFlush(5,true,{x:4,y:0,z:0})!;
  const pans=nodes.filter(n=>n.kind==='pan');expect(pans).toHaveLength(1);expect(pans[0].positionX.value).toBe(1);expect(pans[0].panningModel).toBe('HRTF');expect(pans[0].rolloffFactor).toBe(0);
  expect(nodes.filter(n=>n.kind==='tone')).toHaveLength(12);
  const attenuation=nodes.find(n=>n.kind==='gain'&&n.connect.mock.calls[0]?.[0]===pans[0]);
  expect(attenuation.gain.value).toBeCloseTo(1/(1+5/18));
  sound.updateSpatial(36,{x:0,y:3,z:4});
  expect(pans[0].positionZ.setTargetAtTime).toHaveBeenLastCalledWith(.8,0,.025);
  expect(attenuation.gain.setTargetAtTime).toHaveBeenLastCalledWith(1/3,0,.025);
  const sourceGains=nodes.filter(n=>n.kind==='gain'&&n.connect.mock.calls[0]?.[0]===attenuation);
  expect(sourceGains).toHaveLength(21); // 9 wing noises, 8 beat tones, 4 cackle tones.
  const sources=nodes.filter(n=>n.kind==='tone'||n.kind==='noise').sort((a,b)=>a.stopAt-b.stopAt);
  for(const source of sources.slice(0,-1))source.onended();
  expect(pans[0].disconnect).not.toHaveBeenCalled();
  sources.at(-1).onended();expect(pans[0].disconnect).toHaveBeenCalledOnce();
  expect(sound.active).toBe(false);expect(attenuation.disconnect).toHaveBeenCalledOnce();
  sound.stop();sound.updateSpatial(0,{x:1,y:0,z:0});
  expect(pans[0].disconnect).toHaveBeenCalledOnce();
  expect(pans[0].positionZ.setTargetAtTime).toHaveBeenCalledOnce();
  const stopped=audio.playPheasantFlush(5,false)!;stopped.stop();expect(stopped.active).toBe(false);
  audio.setAudioEnabled(false);audio.playPheasantFlush(5,false,{x:-1,y:0,z:0});
  expect(nodes.filter(n=>n.kind==='pan')).toHaveLength(2);
});
