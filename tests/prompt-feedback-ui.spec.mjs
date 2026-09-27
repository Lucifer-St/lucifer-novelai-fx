import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {WORKBENCH_SKINS,APPEARANCE_KEY} from '../src/lib/loading-skins.mjs';
import pkg from '../package.json' with {type:'json'};
import {mkdir} from 'node:fs/promises';

async function setup(page,skin='classic'){
 const calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,skin,key,version})=>{
  if(!localStorage.getItem('novelai-studio-v1'))localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));
  localStorage.setItem('lucifer-tag-suggestions-v1','off');
  localStorage.setItem('lucifer-share-release-seen-v1',version);
  localStorage.setItem('lucifer-share-setup-seen-v1','true');
  localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'claire-noire',motion:'off',characterDecorations:false}));
 },{state:{...defaults(),prompt:'quiet garden',seed:42,characters:[{id:'fixture-role',enabled:true,prompt:'1girl, blue hair',negative:'bad hands',x:.5,y:.5}]},skin,key:APPEARANCE_KEY,version:pkg.version});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;calls.push({path,method:route.request().method()});
  const send=json=>route.fulfill({json});
  if(path==='/api/status')return send({keyConfigured:true,generationJobs:true,generationBusy:false});
  if(path==='/api/settings')return send({tutorialComplete:true,beginner:false,provider:'official'});
  if(path==='/api/models')return send({data:[{id:'nai-diffusion-5-full'}]});
  if(path==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[],entries:[]});
  if(path==='/api/assistant/models')return send({models:[]});
  if(path==='/api/assistant/sessions')return send({sessions:[]});
  if(path==='/api/assistant/rules')return send({packs:[]});
  return send({entries:[],active:null,available:false});
 });
 await page.goto('/');
 const release=page.getByRole('button',{name:'关闭更新说明',exact:true});if(await release.isVisible())await release.click();
 await expect(page.getByLabel('正面提示词',{exact:true})).toBeEditable();
 return {calls,errors};
}
const height=el=>el.evaluate(node=>node.getBoundingClientRect().height);

test('official preset controls preserve custom negatives and persist V5 Light',async({page})=>{
 const ctx=await setup(page);
 await page.getByLabel('官方正面预设',{exact:true}).selectOption('light');
 await mkdir('.local/feedback-20260925/ui',{recursive:true});await page.screenshot({path:'.local/feedback-20260925/ui/official-positive.png'});
 await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();
 const negative=page.getByLabel('负面提示词',{exact:true});
 await negative.fill('my custom exclusion');
 await page.getByLabel('官方负面预设',{exact:true}).selectOption('human');
 await expect(negative).toHaveValue(/bad anatomy, my custom exclusion$/);
 await page.screenshot({path:'.local/feedback-20260925/ui/official-negative.png'});
 await page.getByLabel('官方负面预设',{exact:true}).selectOption('light');
 await expect(negative).toHaveValue(/0::ai-generated::, my custom exclusion$/);
 await page.getByLabel('官方负面预设',{exact:true}).selectOption('none');
  await expect(negative).toHaveValue('my custom exclusion');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('novelai-studio-v1')).state.negative)).toBe('my custom exclusion');
 await page.reload();await expect(page.getByLabel('官方正面预设',{exact:true})).toHaveValue('light');
 await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();await expect(negative).toHaveValue('my custom exclusion');
 expect(ctx.calls.filter(c=>c.method==='POST'&&c.path!=='/api/check-updates')).toEqual([]);expect(ctx.errors).toEqual([]);
});

for(const skin of WORKBENCH_SKINS.map(s=>s.id))test(`role inputs fit content and preserve native editing (${skin})`,async({page},info)=>{
 const ctx=await setup(page,skin);
 await page.getByRole('tab',{name:/^角色/}).click();
 const prompt=page.getByLabel('角色 1 正面提示词',{exact:true});
 await expect(prompt).toBeVisible();
 expect(await height(prompt)).toBeLessThan(160);
 expect(await height(page.locator('.character-prompt-editor'))).toBeLessThan(280);
 await prompt.fill(Array.from({length:35},(_,i)=>`line ${i} {{blue hair}}`).join('\n'));
 await expect.poll(()=>height(prompt)).toBeGreaterThan(300);expect(await height(prompt)).toBeLessThanOrEqual(602);
 await prompt.fill('1girl');await prompt.press('End');await prompt.press('X');await expect(prompt).toHaveValue('1girlX');await prompt.press('Control+z');
 await expect(prompt).toHaveValue('1girl');expect(await height(prompt)).toBeLessThan(160);
 await prompt.fill('0.7::hair::');await prompt.evaluate(el=>el.setSelectionRange(0,el.value.length));await prompt.press('Control+ArrowUp');
 await expect(prompt).toHaveValue(/0\.75::hair::/);
 const tablist=page.getByRole('tablist',{name:'角色 1 正负面提示词',exact:true});
 await tablist.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();
 await page.getByLabel('角色 1 负面提示词',{exact:true}).fill('排除内容');
 await tablist.getByRole('tab',{name:'正面 Prompt',exact:true}).click();await expect(prompt).toHaveValue('0.75::hair::');
 await prompt.evaluate(el=>el.setSelectionRange(6,10));await prompt.dispatchEvent('compositionstart');await prompt.press('Control+ArrowUp');await expect(prompt).toHaveValue('0.75::hair::');await prompt.dispatchEvent('compositionend');
 const beforeDrag=await height(prompt);await prompt.scrollIntoViewIfNeeded();const box=await prompt.boundingBox();await page.mouse.move(box.x+box.width-4,box.y+box.height-4);await page.mouse.down();await page.mouse.move(box.x+box.width-4,box.y+box.height+70,{steps:5});await page.mouse.up();
 expect(await height(prompt)).toBeGreaterThan(beforeDrag+30);
 await prompt.fill('0.75::hair::, short');await expect.poll(()=>height(prompt)).toBeLessThan(160);
 const mirror=prompt.locator('..').locator('.prompt-weight-mirror');
 expect(await mirror.evaluate(el=>el.clientWidth)).toBe(await prompt.evaluate(el=>el.clientWidth));
 await mkdir('.local/feedback-20260925/ui',{recursive:true});
 await page.screenshot({path:`.local/feedback-20260925/ui/${skin}-role-desktop.png`});
 await page.setViewportSize({width:390,height:844});
 expect(await height(prompt)).toBeLessThan(160);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:`.local/feedback-20260925/ui/${skin}-role-mobile.png`});
 expect(ctx.calls.filter(c=>c.method==='POST'&&c.path!=='/api/check-updates')).toEqual([]);expect(ctx.errors).toEqual([]);
});
