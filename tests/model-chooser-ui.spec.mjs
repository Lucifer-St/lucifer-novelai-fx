import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {APPEARANCE_KEY,WORKBENCH_SKINS} from '../src/lib/loading-skins.mjs';
import {MODEL_IDS} from '../src/lib/model-policy.mjs';

const screenshots='.local/model-picker-1.5.1';
const prompt='model picker keeps this prompt';
const v5='nai-diffusion-5-full';
const full='nai-diffusion-4-5-full';
const curated='nai-diffusion-4-5-curated';

async function setup(page,skin){
 const errors=[],writes=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({skin,version,state,appearanceKey})=>{
  if(!localStorage.getItem('novelai-studio-v1'))localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));
  if(!localStorage.getItem(appearanceKey))localStorage.setItem(appearanceKey,JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'classic',motion:'off'}));
  localStorage.setItem('lucifer-share-release-seen-v1',version);
  localStorage.setItem('lucifer-share-setup-seen-v1','true');
 },{skin,version:RELEASE_NOTES.version,state:{...defaults(),prompt},appearanceKey:APPEARANCE_KEY});
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET')writes.push(path);
  const fixtures={'/api/status':{keyConfigured:true,app:'Lucifer NovelAI FX',generationJobs:true},'/api/models':{data:MODEL_IDS.map(id=>({id}))},'/api/settings':{tutorialComplete:true,beginner:false},'/api/history':{entries:[]},'/api/anlas':{pricingPolicy:'opus',calibrations:[]},'/api/comparisons':{entries:[],active:null},'/api/library':{entries:[]},'/api/library/categories':{categories:[]},'/api/generated-library':{items:[],nextCursor:null,index:{running:false,scanned:0,total:0}},'/api/generated-library/status':{running:false,scanned:0,total:0}};
  if(fixtures[path])return route.fulfill({json:fixtures[path]});
  return route.fulfill({status:418,json:{error:{message:'Unexpected fixture endpoint '+path}}});
 });
 await page.goto('/');
 await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue(prompt);
 await expect(page.locator('.app')).toHaveAttribute('data-workbench-skin',skin);
 return {errors,writes};
}

for(const {id:skin} of WORKBENCH_SKINS){
 test(`${skin}: model picker is visible and usable on desktop, compact and phone widths`,async({page})=>{
  const ctx=await setup(page,skin);
  const model=page.getByLabel('图像模型',{exact:true});
  await mkdir(screenshots,{recursive:true});
  for(const width of [1440,1024,390]){
   await page.setViewportSize({width,height:width===1024?720:width===390?844:1000});
   if(width===390)await page.getByRole('button',{name:'提示词',exact:true}).click();
   await expect(model).toBeVisible();
   await expect(model.locator('option')).toHaveCount(3);
   expect(await model.locator('option').evaluateAll(options=>options.map(option=>option.value))).toEqual(MODEL_IDS);
   await model.click();
   await model.press('Escape');
   await model.selectOption(full);
   await expect(model).toHaveValue(full);
   await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue(prompt);
   if(width===390)await page.locator('.mobile-tabs').getByRole('button',{name:'参数',exact:true}).click();
   await expect(page.getByRole('group',{name:'V4.5 设置栏目'}).getByRole('button',{name:'参考图',exact:true})).toBeVisible();
   if(width===390)await page.locator('.mobile-tabs').getByRole('button',{name:'提示词',exact:true}).click();
   await model.scrollIntoViewIfNeeded();
   const bounds=await model.boundingBox();
   expect(bounds?.y,`${skin} ${width}: model selector is above the viewport`).toBeGreaterThanOrEqual(0);
   expect(bounds.y+bounds.height,`${skin} ${width}: model selector is below the viewport`).toBeLessThanOrEqual(width===1024?720:width===390?844:1000);
   await page.screenshot({path:`${screenshots}/${skin}-${width}-v45.png`});
   await model.selectOption(curated);
   await expect(model).toHaveValue(curated);
   await model.selectOption(v5);
   await expect(model).toHaveValue(v5);
   if(width===390)await page.locator('.mobile-tabs').getByRole('button',{name:'参数',exact:true}).click();
   await expect(page.getByRole('group',{name:'V4.5 设置栏目'})).toHaveCount(0);
   if(width===390)await page.locator('.mobile-tabs').getByRole('button',{name:'提示词',exact:true}).click();
   await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue(prompt);
  }
  await model.selectOption(full);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('novelai-studio-v1')||'{}').state?.model)).toBe(full);
  await page.reload();
  await page.getByRole('button',{name:'提示词',exact:true}).click();
  await expect(model).toBeVisible();
  await expect(model).toHaveValue(full);
  await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue(prompt);
  await page.locator('.mobile-tabs').getByRole('button',{name:'参数',exact:true}).click();
  await expect(page.getByRole('group',{name:'V4.5 设置栏目'}).getByRole('button',{name:'参考图',exact:true})).toBeVisible();
  await page.locator('.mobile-tabs').getByRole('button',{name:'提示词',exact:true}).click();
  expect(ctx.errors).toEqual([]);
  expect(ctx.writes).toEqual([]);
 });
}
