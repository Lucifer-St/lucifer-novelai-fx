import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {APPEARANCE_KEY,WORKBENCH_SKINS} from '../src/lib/loading-skins.mjs';
import pkg from '../package.json' with {type:'json'};
import {mkdir} from 'node:fs/promises';
const height=el=>el.evaluate(n=>n.getBoundingClientRect().height);
for(const skin of WORKBENCH_SKINS.map(s=>s.id))for(const mode of ['classic','merged'])test(`medium adaptive main prompts: ${skin} / ${mode}`,async({page})=>{
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,skin,key,version,mode})=>{
  localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'claire-noire',motion:'off',characterDecorations:false}));
  localStorage.setItem('lucifer-prompt-layout-v1',JSON.stringify({version:1,mode}));
  localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');
 },{state:{...defaults(),prompt:'quiet garden',negative:'blur',seed:42},skin,key:APPEARANCE_KEY,version:pkg.version,mode});
 await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes.push(p);return route.fulfill({json:p==='/api/status'?{keyConfigured:true,generationJobs:true,generationBusy:false}:p==='/api/settings'?{tutorialComplete:true,beginner:false,provider:'official'}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:p==='/api/anlas'?{pricingPolicy:'opus',calibrations:[],entries:[]}:{entries:[],active:null,available:false}});});
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');const dismiss=page.getByRole('button',{name:'关闭更新说明',exact:true});if(await dismiss.isVisible())await dismiss.click();
 const input=page.getByLabel('正面提示词',{exact:true}),negative=page.getByLabel('负面提示词',{exact:true});await expect(input).toBeEditable();
 await expect.poll(()=>height(input)).toBeGreaterThanOrEqual(219);expect(await height(input)).toBeLessThanOrEqual(260);
 if(skin.startsWith('precure-'))expect(await height(page.locator('.precure-prompt-header'))).toBeCloseTo(216,0);
 await page.evaluate(()=>{window.mainEditor=document.getElementById('positive');});
 const long=Array.from({length:36},(_,i)=>`line ${i}: 1.2::silver hair, garden, sunlight::`).join('\n');await input.fill(long);
 await expect.poll(()=>height(input)).toBeGreaterThan(400);expect(await height(input)).toBeLessThanOrEqual(561);expect(await input.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await input.fill('short prompt');await expect.poll(()=>height(input)).toBeLessThanOrEqual(260);
 await input.press('End');await input.press('X');await input.press('Control+z');await expect(input).toHaveValue('short prompt');
 await input.fill('0.7::silver hair::');await input.evaluate(el=>el.setSelectionRange(6,10));await input.dispatchEvent('compositionstart');await input.press('Control+ArrowUp');await expect(input).toHaveValue('0.7::silver hair::');await input.dispatchEvent('compositionend');await input.press('Control+ArrowUp');await expect(input).toHaveValue('0.75::silver hair::');
 await input.scrollIntoViewIfNeeded();const box=await input.boundingBox();await page.mouse.move(box.x+box.width-3,box.y+box.height-3);await page.mouse.down();await page.mouse.move(box.x+box.width-3,box.y+box.height+80,{steps:8});await page.mouse.up();expect(await height(input)).toBeGreaterThan(275);
 if(mode==='classic')await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();else{await page.getByRole('button',{name:'主提示词',exact:true}).click();await expect(input).toBeHidden();await page.getByRole('button',{name:'主提示词',exact:true}).click();}
 await negative.fill(long);await expect.poll(()=>height(negative)).toBeGreaterThan(400);await negative.fill('blur');await expect.poll(()=>height(negative)).toBeLessThanOrEqual(260);
 if(mode==='classic')await page.getByRole('tab',{name:'正面 Prompt',exact:true}).click();
 for(const size of [{width:1440,height:768},{width:390,height:844}]){await page.setViewportSize(size);await input.fill(long);await input.scrollIntoViewIfNeeded();const limit=await input.evaluate(el=>parseFloat(getComputedStyle(el).maxHeight));expect(await height(input)).toBeLessThanOrEqual(limit+1);await input.fill('short');await expect.poll(()=>height(input)).toBeLessThanOrEqual(size.width<900?210:260);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);}
 expect(await page.evaluate(()=>window.mainEditor===document.getElementById('positive'))).toBe(true);
 if(['classic','precure-scrapbook','precure-days'].includes(skin)&&mode==='classic'){await mkdir('.local/prompt-height-20260927/ui',{recursive:true});await page.screenshot({path:`.local/prompt-height-20260927/ui/${skin}-mobile.png`});await page.setViewportSize({width:1440,height:1000});await input.scrollIntoViewIfNeeded();await page.screenshot({path:`.local/prompt-height-20260927/ui/${skin}-desktop.png`});}
 expect(errors).toEqual([]);expect(writes).toEqual([]);
});
