import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('routes the complete pheasant flush through one clamped stereo node and releases it last', async()=>{
  const nodes:any[]=[];
  const param=()=>({value:0,setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
  const node=(kind:string)=>{
    const n:any={kind,gain:param(),frequency:param(),pan:param(),onended:null,stopAt:0,
      connect:vi.fn((destination:any)=>destination),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn((time:number)=>{n.stopAt=time;})};
    nodes.push(n);return n;
  };
  vi.stubGlobal('AudioContext',class {
    state='running';currentTime=0;sampleRate=100;destination={};
    createGain(){return node('gain');} createStereoPanner(){return node('pan');}
    createOscillator(){return node('tone');}createBiquadFilter(){return node('filter');}
    createBufferSource(){return node('noise');}
    createBuffer(_channels:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
  });
  const audio=await import('../src/audio');audio.playPheasantFlush(5,true,4);
  const pans=nodes.filter(n=>n.kind==='pan');expect(pans).toHaveLength(1);expect(pans[0].pan.value).toBe(1);
  expect(nodes.filter(n=>n.kind==='tone')).toHaveLength(12);
  const sourceGains=nodes.filter(n=>n.kind==='gain'&&n.connect.mock.calls[0]?.[0]===pans[0]);
  expect(sourceGains).toHaveLength(21); // 9 wing noises, 8 beat tones, 4 cackle tones.
  const sources=nodes.filter(n=>n.kind==='tone'||n.kind==='noise').sort((a,b)=>a.stopAt-b.stopAt);
  for(const source of sources.slice(0,-1))source.onended();
  expect(pans[0].disconnect).not.toHaveBeenCalled();
  sources.at(-1).onended();expect(pans[0].disconnect).toHaveBeenCalledOnce();
  audio.setAudioEnabled(false);audio.playPheasantFlush(5,false,-1);
  expect(nodes.filter(n=>n.kind==='pan')).toHaveLength(1);
});
