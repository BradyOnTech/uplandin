import { huntAssists, onHuntAssists } from '../assistsRuntime';
import { huntingDoctrine } from '../../game/huntDoctrine';
import type { Vec2 } from '../../game/types';
import { dogWorkLabel, fieldCompassHeading } from '../dogLocator';
import type { Ctx, Subsystem } from '../engine';
import { constrainSurveyView, createSurveyAtlas, placeSurveyLabels, surveyPoint, surveyTransform, zoomSurveyView,
  type SurveyLabel, type SurveyView } from '../maps/surveyMap';
import type { Hunt3DSystem } from './hunt3d';

/** A field atlas built from the same property as the hunt. No concealed-bird data. */
export class FieldMapSystem implements Subsystem {
  readonly id = 'field-map';
  private hunt!: Hunt3DSystem;
  private panel = document.getElementById('field-map');
  private canvas = document.getElementById('field-map-canvas') as HTMLCanvasElement | null;
  private toggleButton = document.getElementById('field-map-toggle');
  private closeButton = document.getElementById('field-map-close');
  private context?: CanvasRenderingContext2D;
  private atlas?: ReturnType<typeof createSurveyAtlas>;
  private view: SurveyView = { center: {x:0,y:0}, zoom:1 };
  private open = false;
  private hasOpened = false;
  private nextDraw = 0;
  private paintFrame = 0;
  private abort = new AbortController();
  private resize?: ResizeObserver;
  private pointers = new Map<number,Vec2>();

  init(ctx: Ctx): void {
    this.hunt=ctx.get<Hunt3DSystem>('hunt3d');
    if(!this.panel||!this.canvas)return;
    this.context=this.canvas.getContext('2d')??undefined;
    const area=this.hunt.areaConfig();
    this.view.center={x:area.world.x+area.world.w/2,y:area.world.y+area.world.h/2};
    this.setText('field-map-title',area.name);
    this.setText('field-map-subtitle','UPLANDIN · PROPERTY ATLAS');
    this.setText('field-map-caption',huntingDoctrine(area.id).guidance);
    for(const key of ['.map-key-crop','.map-key-trees']){
      const item=this.panel.querySelector(key)?.parentElement;if(item)item.hidden=area.id!=='pheasant-coverts';
    }
    const waterKey=this.panel.querySelector('.map-key-water')?.parentElement;
    if(waterKey)waterKey.hidden=!area.landmarks.some(landmark=>landmark.kind==='pond');
    const signal=this.abort.signal;
    this.resize=new ResizeObserver(()=>this.queueDraw(ctx));this.resize.observe(this.canvas);
    this.toggleButton?.addEventListener('click',()=>this.setOpen(!this.open,ctx),{signal});
    // Without a map in the kit there is no survey button, and an open map closes.
    const applyAssists=()=>{
      const available=huntAssists().surveyMap;
      this.toggleButton?.classList.toggle('assist-off',!available);
      if(!available&&this.open)this.setOpen(false,ctx);
    };
    applyAssists();onHuntAssists(applyAssists,signal);
    this.closeButton?.addEventListener('click',()=>this.setOpen(false,ctx),{signal});
    this.panel.querySelectorAll<HTMLButtonElement>('[data-map-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.mapAction;
      if(action==='in'||action==='out')this.zoom(action==='in'?1.4:1/1.4,undefined,ctx);
      else if(action==='fit'){
        this.view={zoom:1,center:{x:area.world.x+area.world.w/2,y:area.world.y+area.world.h/2}};
        this.queueDraw(ctx);
      }else if(action==='hunter'||action==='truck'){
        this.view={zoom:Math.max(2.4,this.view.zoom),center:{...(action==='hunter'?this.hunt.huntState().hunterPos:this.hunt.dropPoint().position)}};
        this.queueDraw(ctx);
      }
    },{signal}));
    document.addEventListener('keydown',event=>{
      if(event.metaKey||event.ctrlKey||event.altKey)return;
      const target=event.target as HTMLElement|null;
      if(target&&/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))return;
      if(event.code==='KeyM'&&!event.repeat&&!document.querySelector('#field-overlay:not([hidden])')&&huntAssists().surveyMap){
        event.preventDefault();this.setOpen(!this.open,ctx);return;
      }
      if(!this.open)return;
      if(event.code==='Escape'){event.preventDefault();this.setOpen(false,ctx);return;}
      if(event.code==='Tab'){
        const items=Array.from(this.panel!.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]'));
        const first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      if(event.key==='+'||event.key==='='||event.key==='-'){
        event.preventDefault();this.zoom(event.key==='-'?1/1.4:1.4,undefined,ctx);
      }
      const direction:Record<string,[number,number]>={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]};
      if(direction[event.code]){event.preventDefault();this.pan(...direction[event.code],ctx);}
    },{signal});
    document.addEventListener('focusin',event=>{
      if(this.open&&event.target instanceof Node&&!this.panel!.contains(event.target))this.closeButton?.focus();
    },{signal});
    this.canvas.addEventListener('wheel',event=>{
      if(!this.open)return;event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?this.canvas!.clientHeight:1);
      this.zoom(Math.exp(-Math.max(-160,Math.min(160,delta))*.003),this.localPoint(event),ctx);
    },{signal,passive:false});
    this.canvas.addEventListener('pointerdown',event=>{
      if(!this.open||event.button!==0)return;
      event.preventDefault();this.canvas!.focus();this.canvas!.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId,this.localPoint(event));this.canvas!.classList.add('is-panning');
    },{signal});
    this.canvas.addEventListener('pointermove',event=>{
      const old=this.pointers.get(event.pointerId);if(!old)return;
      const before=[...this.pointers.values()];this.pointers.set(event.pointerId,this.localPoint(event));
      const after=[...this.pointers.values()];
      if(before.length>=2){
        const midpoint=(points:Vec2[])=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
        const a=midpoint(before),b=midpoint(after);
        const d1=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y);
        const d2=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
        this.pan(b.x-a.x,b.y-a.y,ctx);if(d1>4)this.zoom(d2/d1,b,ctx);
      }else this.pan(after[0].x-old.x,after[0].y-old.y,ctx);
    },{signal});
    const release=(event:PointerEvent)=>{
      this.pointers.delete(event.pointerId);
      if(!this.pointers.size)this.canvas?.classList.remove('is-panning');
    };
    this.canvas.addEventListener('pointerup',release,{signal});
    this.canvas.addEventListener('pointercancel',release,{signal});
    this.canvas.addEventListener('lostpointercapture',release,{signal});
    this.canvas.addEventListener('dblclick',event=>this.zoom(1.6,this.localPoint(event),ctx),{signal});
  }

  update(ctx:Ctx):void{
    if(this.open&&ctx.time>=this.nextDraw){this.nextDraw=ctx.time+.2;this.queueDraw(ctx);}
  }
  private setText(id:string,text:string):void{const element=document.getElementById(id);if(element&&element.textContent!==text)element.textContent=text;}
  private localPoint(event:MouseEvent|PointerEvent):Vec2{
    const rect=this.canvas!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  private zoom(factor:number,at:Vec2|undefined,ctx:Ctx):void{
    const {width,height}=this.canvas!.getBoundingClientRect();
    this.view=zoomSurveyView(this.hunt.areaConfig().world,width,height,this.view,factor,at??{x:width/2,y:height/2});this.queueDraw(ctx);
  }
  private pan(dx:number,dy:number,ctx:Ctx):void{
    const {width,height}=this.canvas!.getBoundingClientRect(),t=surveyTransform(this.hunt.areaConfig().world,width,height,this.view);
    this.view.center.x-=dx/t.scale;this.view.center.y-=dy/t.scale;this.queueDraw(ctx);
  }
  private queueDraw(ctx:Ctx):void{
    if(!this.open||this.paintFrame)return;
    this.paintFrame=requestAnimationFrame(()=>{this.paintFrame=0;if(this.open)this.draw(ctx);});
  }
  private setOpen(open:boolean,ctx:Ctx):void{
    if(open&&document.body.classList.contains('hunt-arriving'))return;
    if(!this.panel||this.open===open)return;
    this.open=open;this.panel.hidden=!open;this.toggleButton?.setAttribute('aria-expanded',String(open));
    if(open&&!this.hasOpened){
      const rect=this.canvas!.getBoundingClientRect();
      this.view={zoom:rect.width<500||window.innerHeight<550?2.4:2,center:{...this.hunt.huntState().hunterPos}};
      this.hasOpened=true;
    }
    this.pointers.clear();this.canvas?.classList.remove('is-panning');
    if(open){this.queueDraw(ctx);this.closeButton?.focus();}else this.toggleButton?.focus();
    ctx.events.dispatchEvent(new CustomEvent('field-map-state',{detail:{open}}));
  }

  private draw(ctx:Ctx):void{
    const canvas=this.canvas,g=this.context;if(!canvas||!g)return;
    const {width:w,height:h}=canvas.getBoundingClientRect();if(w<1||h<1)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const width=Math.round(w*dpr),height=Math.round(h*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const area=this.hunt.areaConfig(),world=area.world,state=this.hunt.huntState();
    if(!this.atlas)this.atlas=createSurveyAtlas(area);
    this.view=constrainSurveyView(world,w,h,this.view);
    const t=surveyTransform(world,w,h,this.view),point=(p:Vec2)=>surveyPoint(t,p);
    const corner=point(world),mapW=world.w*t.scale,mapH=world.h*t.scale;
    g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);g.fillStyle='#e8e2cc';g.fillRect(0,0,w,h);
    g.save();g.shadowColor='#4d4a3020';g.shadowBlur=18;g.fillStyle='#d7d1b5';g.fillRect(corner.x,corner.y,mapW,mapH);g.restore();
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(this.atlas.canvas,corner.x,corner.y,mapW,mapH);
    g.save();g.beginPath();g.rect(corner.x,corner.y,mapW,mapH);g.clip();
    // Working lines are the authored paths, never shortcuts through water.
    g.lineJoin='round';g.lineCap='round';
    g.beginPath();
    for(const trail of area.trails){
      if(trail.points.length<2)continue;
      trail.points.forEach((p,i)=>{const q=point(p);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y);});
    }
    g.setLineDash([]);g.strokeStyle='#f8efd9a8';g.lineWidth=3.5;g.stroke();
    g.setLineDash([5,4]);g.strokeStyle='#945a3e';g.lineWidth=1.3;g.stroke();
    g.setLineDash([]);g.restore();
    g.strokeStyle='#6e77558a';g.lineWidth=1;g.strokeRect(corner.x,corner.y,mapW,mapH);

    const drop=this.hunt.dropPoint();
    // Only a GPS collar with a mapping handheld puts the dog on the map.
    const dogPositions=this.hunt.trackingGearTier()>=3?Array.from({length:this.hunt.dogCount()},(_,i)=>this.hunt.dog(i).pos):[];
    const live=[{id:'hunter',name:'You',pos:state.hunterPos},
      ...dogPositions.map((pos,i)=>({id:'dog-'+i,name:dogPositions.length>1?'Dog '+(i+1):'Dog',pos})),
      {id:'truck',name:'Truck',pos:drop.position}];
    const groups:{ids:string[];names:string[];point:Vec2}[]=[];
    for(const marker of live){
      const p=point(marker.pos),near=groups.find(group=>Math.hypot(group.point.x-p.x,group.point.y-p.y)<15);
      if(near){near.ids.push(marker.id);near.names.push(marker.name);}else groups.push({ids:[marker.id],names:[marker.name],point:p});
    }
    const labels:SurveyLabel[]=[];
    const label=(id:string,text:string,p:Vec2)=>{
      if(p.x<0||p.x>w||p.y<0||p.y>h)return;
      g.font='600 11px -apple-system, sans-serif';labels.push({id,text,point:p,width:g.measureText(text).width+12,height:22});
    };
    for(const group of groups)label(group.ids[0],group.names.join(' · '),group.point);
    for(const landmark of area.landmarks){
      if(landmark.id===drop.landmarkId)continue;
      const p=point(landmark.position);if(p.x<-20||p.x>w+20||p.y<-20||p.y>h+20)continue;
      g.fillStyle=landmark.kind==='pond'?'#49797c':landmark.kind==='barn'?'#9b654a':'#56634c';g.strokeStyle='#f4ebd4';g.lineWidth=1.5;
      if(landmark.kind==='barn'){
        g.save();g.translate(p.x,p.y);g.fillRect(-5,-4,10,8);g.strokeRect(-5,-4,10,8);g.strokeStyle='#e7cca0';g.beginPath();g.moveTo(0,-4);g.lineTo(0,4);g.stroke();g.restore();
      }else if(landmark.kind!=='pond'||area.id!=='pheasant-coverts'){
        g.beginPath();g.arc(p.x,p.y,3.5,0,Math.PI*2);g.fill();g.stroke();
      }
      label(landmark.id,landmark.name,p);
    }
    for(const group of groups){
      const {x,y}=group.point;if(x<0||x>w||y<0||y>h)continue;
      const hunter=group.ids.includes('hunter'),truck=group.ids[0]==='truck';
      g.fillStyle=hunter?'#264c54':truck?'#835139':'#b17532';g.strokeStyle='#fff8e5';g.lineWidth=2.2;
      if(truck){g.beginPath();g.roundRect(x-6,y-5,12,10,2);g.fill();g.stroke();}
      else{g.beginPath();g.arc(x,y,hunter?6:5,0,Math.PI*2);g.fill();g.stroke();}
      if(hunter){
        g.save();g.translate(x,y);g.rotate(-ctx.camera.rotation.y);g.fillStyle='#264c54';
        g.beginPath();g.moveTo(0,-20);g.lineTo(-4,-11);g.lineTo(4,-11);g.closePath();g.fill();g.restore();
      }
    }
    for(const item of placeSurveyLabels(labels,{x:10,y:12,w:w-20,h:h-78})){
      const {box:b,point:p}=item;
      g.strokeStyle='#59634d70';g.lineWidth=.7;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(Math.max(b.x,Math.min(b.x+b.w,p.x)),Math.max(b.y,Math.min(b.y+b.h,p.y)));g.stroke();
      const liveLabel=/^(hunter|dog-|truck)/.test(item.id);
      g.fillStyle=liveLabel?'#faf4e4f5':'#eee7cdd9';g.beginPath();g.roundRect(b.x,b.y,b.w,b.h,4);g.fill();
      g.font=(liveLabel?'650':'500')+' 11px -apple-system, sans-serif';g.fillStyle=liveLabel?'#294b4c':'#404e3c';g.fillText(item.text,b.x+6,b.y+15);
    }
    // North stays fixed while the player's heading marker turns with the camera.
    g.fillStyle='#eee8d4e8';g.beginPath();g.roundRect(w-52,12,38,60,7);g.fill();
    g.fillStyle='#405442';g.textAlign='center';g.font='650 11px -apple-system, sans-serif';g.fillText('N',w-33,29);
    g.beginPath();g.moveTo(w-33,36);g.lineTo(w-39,56);g.lineTo(w-33,52);g.lineTo(w-27,56);g.closePath();g.fill();g.textAlign='left';
    const yards=[10,25,50,100,200,500].filter(value=>value*t.scale<110).at(-1)??10;
    const bar=yards*t.scale;
    g.fillStyle='#f3eddcf2';g.beginPath();g.roundRect(14,h-60,Math.max(120,bar+24),46,6);g.fill();
    g.strokeStyle='#495c48';g.lineWidth=1.5;g.beginPath();g.moveTo(26,h-29);g.lineTo(26+bar,h-29);g.moveTo(26,h-33);g.lineTo(26,h-25);g.moveTo(26+bar,h-33);g.lineTo(26+bar,h-25);g.stroke();
    g.fillStyle='#495c48';g.font='600 10px -apple-system, sans-serif';g.fillText(yards+' yd',26,h-39);
    g.font='9px -apple-system, sans-serif';g.fillText(this.atlas.contourStep+' m contours',26,h-17);
    const wind=fieldCompassHeading(-state.wind-Math.PI/2).cardinal;
    this.setText('field-map-wind','Wind toward '+wind+' · '+state.windStrength);
    this.setText('field-map-zoom',Math.round(this.view.zoom*100)+'%');
    const hunter=state.hunterPos,dog=dogPositions[0];
    this.setText('field-map-position','Facing '+fieldCompassHeading(ctx.camera.rotation.y).cardinal);
    this.setText('field-map-dog',!dog?'No GPS on the map':dog?Math.round(Math.hypot(dog.x-hunter.x,dog.y-hunter.y))+' yd · '+dogWorkLabel(this.hunt.dog(),area.id).toLowerCase().replace(/^dog /,''):'');
    this.setText('field-map-truck',Math.round(Math.hypot(drop.position.x-hunter.x,drop.position.y-hunter.y))+' yd · '+drop.name);
    for(const button of this.panel!.querySelectorAll<HTMLButtonElement>('[data-map-action]')){
      if(button.dataset.mapAction==='out')button.disabled=this.view.zoom<=1;
      if(button.dataset.mapAction==='in')button.disabled=this.view.zoom>=5;
    }
    canvas.dataset.zoom=String(this.view.zoom);
    canvas.setAttribute('aria-label',area.name+'. North-up map of actual terrain, cover and paths. Zoom '+Math.round(this.view.zoom*100)+' percent. Drag to pan; use plus and minus to zoom.');
  }
  dispose():void{this.resize?.disconnect();this.abort.abort();cancelAnimationFrame(this.paintFrame);this.atlas=undefined;this.pointers.clear();}
}
