/** Ordinary-input checks: nearby points, exact replay, and a fresh T drill. */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='output/playwright/falconry';mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({headless:true,args:['--disable-frame-rate-limit','--disable-gpu-vsync']});
const page=await browser.newPage();await page.setViewport({width:1280,height:720});
const report={runs:[],errors:[],passed:false};page.on('pageerror',e=>report.errors.push(String(e)));
const point=async()=>{
  await page.waitForFunction('window.__ready3d === true',{timeout:60000});
  const start=Date.now();await page.click('#enter-field');
  await page.waitForFunction(()=>window.__api3d.hunt().dog.state==='pointing',{timeout:10000});
  const state=await page.evaluate(()=>window.__api3d.telemetry());
  return {seed:new URL(page.url()).searchParams.get('seed'),pointSeconds:(Date.now()-start)/1000,bird:state.pointedBird};
};
try {
  for(const seed of [61,62,63,999]){
    await page.goto(`http://127.0.0.1:4527/index3d.html?play=quick&method=goshawk&practice=slip&seed=${seed}&quality=lite`,{waitUntil:'domcontentloaded'});
    const run=await point();report.runs.push(run);console.log(run);
    if(seed===61){
      await page.evaluate(()=>document.exitPointerLock());
      const repeat=await page.$('button::-p-text(Repeat setup)');
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),repeat.click()]);
      const replay=await point();
      if(replay.seed!==run.seed||JSON.stringify(replay.bird)!==JSON.stringify(run.bird))throw new Error('Repeat setup changed the bird');
      report.repeat=true;
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.keyboard.press('KeyT')]);
      const fresh=await point();report.runs.push(fresh);
      if(fresh.seed===run.seed||JSON.stringify(fresh.bird)===JSON.stringify(run.bird))throw new Error('T did not vary the drill');
      report.newDrill=true;
    }
  }
  if(new Set(report.runs.map(r=>JSON.stringify(r.bird))).size!==report.runs.length)throw new Error('Repeated placement across seeds');
  report.passed=report.errors.length===0;
} catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{writeFileSync(`${out}/practice-variants.json`,JSON.stringify(report,null,2));await browser.close();}
