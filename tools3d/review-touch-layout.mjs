import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const out=resolve(opt('--out','docs/3d/art-direction-refresh/mobile/layout'));mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({headless:false});const result={evidence:'emulated touch layout, not physical-device usability',views:[],errors:[]};
try {
 const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
 for(const [width,height] of [[844,390],[390,844],[667,375],[568,320]]) {
  await page.setViewport({width,height,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await page.goto(opt('--url','http://127.0.0.1:4557')+'/index3d.html?area=quail-fields&dog=generated&quality=lite');
  await page.waitForFunction('window.__ready3d === true');
  const boxes=await page.evaluate(()=>['.field-card','#enter-field','#field-options','#offline-status'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,visible:!e.hidden};}));
  await page.screenshot({path:`${out}/${width}x${height}-menu.png`});
  if(args.includes('--verify-scroll') && height===320) {
    const session=await page.createCDPSession();
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:430,y:280,id:1}]});
    for(let y=260;y>=100;y-=20) {
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:430,y,id:1}]});
      await new Promise(r=>setTimeout(r,20));
    }
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await new Promise(r=>setTimeout(r,200));
    const bottom=await page.evaluate(()=>{const challenge=document.querySelector('#challenge-setting')?.getBoundingClientRect();return {scroll:document.getElementById('field-overlay').scrollTop,bottom:document.querySelector('.menu-link').getBoundingClientRect().bottom,challenge:challenge?{top:challenge.top,bottom:challenge.bottom,left:challenge.left,right:challenge.right}:null};});
    assert.ok(bottom.scroll>40,'Touch swipe scrolls the short-screen menu');assert.ok(bottom.bottom<=height,'Menu link reachable');
    if(bottom.challenge) assert.ok(bottom.challenge.top>=0 && bottom.challenge.bottom<=height && bottom.challenge.left>=0 && bottom.challenge.right<=width,'Challenge setting reachable after touch scroll');
    boxes.push({scrollCheck:bottom});await page.screenshot({path:`${out}/${width}x${height}-scrolled.png`});
  }
  const button=await page.$('#enter-field'),r=await button.boundingBox();await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
  await page.waitForFunction('document.getElementById("field-overlay").hidden === true');
  const controls=await page.evaluate(()=>[...document.querySelectorAll('#touch-controls button,#pause-hunt,#end-hunt')].map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height};}));
  const locator=await page.evaluate(()=>{const e=document.querySelector('#dog-locator');if(!e)return null;const r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
  if(locator){assert.ok(locator.x>=0 && locator.right<=width,'Dog locator fits viewport');assert.ok(locator.y>=0 && locator.bottom<=height,'Dog locator fits viewport height');}
  await page.screenshot({path:`${out}/${width}x${height}-field.png`});
  result.views.push({width,height,boxes,controls,locator});
 }
} catch(e){result.errors.push(String(e));process.exitCode=1;}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
