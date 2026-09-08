import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const base=option('--url','http://127.0.0.1:4565');
const out=resolve(option('--out','docs/3d/art-direction-refresh/challenge/interface'));mkdirSync(out,{recursive:true});
const uncapped=args.includes('--uncapped');
const browser=await puppeteer.launch({headless:args.includes('--headless'),args:uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
const result={evidence:uncapped?'Uncapped diagnostic menu and preference checks; not native browser performance':'Ordinary browser menu and paused-hunt preference changes; no forced game outcomes',checks:[],errors:[],result:'running'};
let page;
try {
 page=await browser.newPage();await page.setViewport({width:1000,height:850});
 page.on('pageerror',e=>result.errors.push(String(e)));
 const ready=()=>page.waitForFunction('window.__ready3d === true',{timeout:60000});
 const read=()=>page.evaluate(()=>({hunt:window.__api3d.hunt(),choice:document.querySelector('#challenge-setting').value,
  help:document.querySelector('#challenge-help').textContent,
  saves:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='uplandin.3d.hunt-challenge.v1'))}));
 await page.goto(base+'/index3d.html?area=quail-fields&dog=generated&quality=lite&challenge=balanced');await ready();
 const balanced=await read();
 assert.equal(typeof balanced.hunt.seed,'number');
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.select('#challenge-setting','wild')]);await ready();
 const wild=await read();assert.equal(wild.choice,'wild');assert.ok(wild.hunt.tally.hidden<balanced.hunt.tally.hidden);
 assert.equal(wild.hunt.seed,balanced.hunt.seed);
 assert.deepEqual(wild.saves,balanced.saves);result.checks.push({event:'pre-hunt-wild',birds:wild.hunt.tally.hidden});
 await page.screenshot({path:out+'/wild-menu.png'});
 await page.click('#enter-field');await page.waitForFunction('window.__api3d.telemetry().paused === false');
 await page.keyboard.press('Escape');await page.waitForFunction('window.__api3d.telemetry().paused === true');
 const paused=await read();await page.select('#challenge-setting','relaxed');const pending=await read();
 assert.deepEqual(pending.hunt,paused.hunt);assert.deepEqual(pending.saves,paused.saves);
 assert.match(pending.help,/next hunt/);result.checks.push({event:'paused-selection-preserves-current-hunt'});
 await page.screenshot({path:out+'/next-hunt-setting.png'});
 await page.reload({waitUntil:'domcontentloaded'});await ready();const relaxed=await read();
 assert.equal(relaxed.choice,'relaxed');assert.ok(relaxed.hunt.tally.hidden>balanced.hunt.tally.hidden);
 assert.equal(relaxed.hunt.seed,balanced.hunt.seed);
 assert.deepEqual(relaxed.saves,balanced.saves);result.checks.push({event:'next-hunt-relaxed',birds:relaxed.hunt.tally.hidden});
 await page.click('#enter-field');await page.waitForFunction('window.__api3d.telemetry().paused === false');
 await page.evaluate(()=>document.exitPointerLock());
 await page.click('#end-hunt');await page.waitForSelector('#hunt-again',{visible:true});
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#hunt-again')]);await ready();
 const fresh=await read();assert.notEqual(fresh.hunt.seed,relaxed.hunt.seed);assert.equal(fresh.choice,'relaxed');
 assert.deepEqual(fresh.saves,relaxed.saves);result.checks.push({event:'hunt-again-fresh-seed',previous:relaxed.hunt.seed,current:fresh.hunt.seed});
 result.result='passed';
} catch(error){result.result='failed';result.errors.push(String(error));if(page)result.failureState=await page.evaluate(()=>({url:location.href,text:document.body.innerText,ready:window.__ready3d}));process.exitCode=1;}
finally {await browser.close();writeFileSync(out+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
