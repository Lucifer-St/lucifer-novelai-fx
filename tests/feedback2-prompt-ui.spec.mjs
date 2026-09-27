import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {APPEARANCE_KEY} from '../src/lib/loading-skins.mjs';
import pkg from '../package.json' with {type:'json'};
import {mkdir} from 'node:fs/promises';

for(const skin of ['precure-scrapbook','precure-days'])test(`feedback2 ${skin} has a larger main editor with approved art and manual sizing intact`,async({page})=>{
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,skin,key,version})=>{
  localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'claire-noire',motion:'off',characterDecorations:false}));
  localStorage.setItem('lucifer-tag-suggestions-v1','local');localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');
 },{state:{...defaults(),prompt:'0.7::soft lighting::, quiet garden, a detective reading a book',negative:'blur',seed:42},skin,key:APPEARANCE_KEY,version:pkg.version});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET'&&path!=='/api/check-updates')writes.push(path);return route.fulfill({json:path==='/api/status'?{keyConfigured:true,generationJobs:true}:path==='/api/settings'?{tutorialComplete:true,beginner:false}:path==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:path==='/api/anlas'?{pricingPolicy:'opus',calibrations:[],entries:[]}:path==='/api/library'?{entries:[]}:{entries:[],active:null,available:false}});});
 await page.setViewportSize({width:1526,height:1030});await page.goto('/');const dismiss=page.getByRole('button',{name:'关闭更新说明',exact:true});if(await dismiss.isVisible())await dismiss.click();
 const input=page.getByLabel('正面提示词',{exact:true}),editor=page.locator('.prompt-content>.prompt-editor');await expect(input).toBeEditable();
 expect(await page.locator('.precure-prompt-header').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(220);
 expect(await editor.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(559);expect(await input.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(430);
 expect(await editor.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(800);
 await mkdir('.local/feedback2-20260926/ui',{recursive:true});await page.screenshot({path:`.local/feedback2-20260926/ui/${skin}-larger-overview.png`});
 // Scroll the unchanged artwork out of the way while editing; tabs stay reachable.
 await editor.evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:`.local/feedback2-20260926/ui/${skin}-larger-editing.png`});
 const visible=await input.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.left-panel').getBoundingClientRect();return Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top);});expect(visible).toBeGreaterThan(430);
 await input.fill('short edited prompt');await input.press('End');await input.press('X');await input.press('Control+z');await expect(input).toHaveValue('short edited prompt');
 await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();await expect(page.getByLabel('负面提示词',{exact:true})).toHaveValue('blur');await page.getByRole('tab',{name:'正面 Prompt',exact:true}).click();
 await page.setViewportSize({width:1440,height:768});expect(await input.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(430);await expect(page.getByRole('tab',{name:'正面 Prompt',exact:true})).toBeVisible();
 await page.locator('.generate').scrollIntoViewIfNeeded();await expect(page.locator('.generate')).toBeInViewport();await page.screenshot({path:`.local/feedback2-20260926/ui/${skin}-generate-reachable.png`});
 await editor.evaluate(el=>{el.style.height='670px';});await page.setViewportSize({width:1526,height:1030});expect(await editor.evaluate(el=>el.style.height)).toBe('670px');await expect(input).toHaveValue('short edited prompt');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await expect(input).toHaveValue('short edited prompt');expect(errors).toEqual([]);expect(writes).toEqual([]);
});
