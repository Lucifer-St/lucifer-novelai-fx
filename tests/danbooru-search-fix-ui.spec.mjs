import {test,expect} from '@playwright/test';import {mkdir} from 'node:fs/promises';import path from 'node:path';
import {studioFixture} from './fixtures/studio.mjs';import {defaults} from '../src/lib/request.mjs';import pkg from '../package.json' with {type:'json'};
const evidence='.local/danbooru-search-20260929/ui';
async function setup(page,{skin='classic',policy='opus'}={}){
 let cleanup;const queries=[],errors=[];
 const fixture=await studioFixture({after:fn=>cleanup=fn},{distDir:process.env.FX_TEST_DIST_DIR||path.resolve('.local/danbooru-search-20260929/dist'),fetchImpl:async(url,init)=>{
  if(new URL(url).hostname==='danbooru.donmai.us'){const q=new URL(url).searchParams.get('tags');queries.push(q);if(q.includes('1girl 1boy')&&q.includes('order:'))return Response.json({error:'PostQuery::TagLimitError'},{status:422});return Response.json([{id:123,rating:'g',file_ext:'png',tag_string_general:'1girl 1boy'}]);}
  if(init.method!=='GET')throw Error('Unexpected generation');return Response.json({data:[{id:'nai-diffusion-5-full'}]});
 }});
 await fixture.request('/api/anlas',{action:'pricingPolicy',value:policy});
 await page.addInitScript(({version,state,skin})=>{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-share-auto-update-check-v1','off');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem('lucifer-fx-appearance-v1',JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'classic'}));},{version:pkg.version,state:{...defaults(),prompt:'test garden',seed:42,width:1024,height:1024,steps:28},skin});
 page.on('pageerror',e=>errors.push(e.message));await page.goto(fixture.base);await expect(page.getByLabel('正面提示词',{exact:true})).toBeEditable();await mkdir(evidence,{recursive:true});return {fixture,queries,errors,cleanup};
}
for(const mobile of [false,true])test(`Chinese boy completion survives IME, chooses English and sends an actual two-tag query (${mobile})`,async({page})=>{
 const c=await setup(page,{skin:mobile?'precure-days':'classic'});try{
  if(mobile)await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'D站图库',exact:true}).click();await expect(page.getByRole('button',{name:'查看图片 #123',exact:true})).toBeVisible();await page.waitForTimeout(550);
  const input=page.getByLabel('Danbooru 搜索标签');await input.focus();
  await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'男孩');el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'男孩',isComposing:true,inputType:'insertCompositionText'}));});
  await expect(input).toHaveAttribute('aria-expanded','false');await input.dispatchEvent('compositionend',{data:'男孩'});
  const boy=page.locator('.danbooru-completion [role=option]').filter({hasText:/^1boy/}).first();await expect(boy).toBeVisible();await page.screenshot({path:evidence+`/boy-${mobile}.png`});await boy.click();await expect(input).toHaveValue('1boy');expect(c.queries).toHaveLength(1);
  await input.fill('1girl,1boy');await page.locator('.danbooru-search-row').getByRole('button',{name:'搜索',exact:true}).click();await expect.poll(()=>c.queries.at(-1)).toBe('1girl 1boy rating:g');await expect(input).toHaveValue('1girl 1boy');await expect(page.getByRole('button',{name:'查看图片 #123',exact:true})).toBeVisible();
  await page.waitForTimeout(550);await page.getByLabel('Danbooru 排序').selectOption('score');await expect(page.getByRole('alert')).toContainText('排序占 1 项');await page.getByRole('button',{name:'改按最新排序',exact:true}).click();await expect(page.getByRole('button',{name:'查看图片 #123',exact:true})).toBeVisible();
  await input.fill('男孩');await page.locator('.danbooru-search-row').getByRole('button',{name:'搜索',exact:true}).click();await expect(page.getByRole('alert')).toContainText('选择英文标签');expect(c.queries.some(q=>q.includes('男孩'))).toBe(false);await input.focus();await expect(boy).toBeVisible();expect(c.errors).toEqual([]);
 }finally{await c.cleanup();}
});
test('missing Chinese match is visible and can be reopened with the keyboard',async({page})=>{
 const c=await setup(page);try{await page.getByRole('button',{name:'D站图库',exact:true}).click();const input=page.getByLabel('Danbooru 搜索标签');await input.fill('不存在的猫猫星球词语');await expect(page.locator('.danbooru-completion')).toContainText('暂未收录');await input.press('Escape');await expect(input).toHaveAttribute('aria-expanded','false');await input.press('ArrowDown');await expect(page.locator('.danbooru-completion')).toContainText('暂未收录');expect(c.errors).toEqual([]);}finally{await c.cleanup();}
});
test('failed local lexicon is reported and a new focus retries without a remote tag request',async({page})=>{
 const c=await setup(page);try{await page.route('**/tag-data/danbooru.json',r=>r.fulfill({status:503,body:'fixture unavailable'}));await page.getByRole('button',{name:'D站图库',exact:true}).click();const input=page.getByLabel('Danbooru 搜索标签');await input.fill('男孩');await expect(page.locator('.danbooru-completion')).toContainText('词库读取失败');await input.press('Tab');await page.unroute('**/tag-data/danbooru.json');await input.focus();await expect(page.locator('.danbooru-completion [role=option]').filter({hasText:/^1boy/}).first()).toBeVisible();expect(c.queries).toHaveLength(1);expect(c.errors).toEqual([]);}finally{await c.cleanup();}
});
for(const skin of ['classic','precure-scrapbook','precure-days','exstia','teresa'])test(`size cost threshold is immediately visible and fits skin ${skin}`,async({page})=>{
 test.skip(skin==='teresa'&&!pkg.name.endsWith('-share'),'Share-only theme');
 const c=await setup(page,{skin});try{const hint=page.getByLabel('尺寸费用提示').filter({visible:true}),width=page.getByLabel('宽度',{exact:true});await expect(hint).toContainText('尺寸在 Opus 免费范围内');await width.fill('1088');await expect(hint).toContainText('尺寸超出 Opus 免费范围');await expect(hint).toContainText('1,114,112');await width.fill('1024');await expect(hint).toContainText('尺寸在 Opus 免费范围内');await page.getByLabel('采样步数 Steps 数值').fill('29');await expect(hint).toContainText('步数超过 28');await width.fill('1536');await hint.scrollIntoViewIfNeeded();await page.screenshot({path:evidence+`/fee-${skin}.png`});expect(c.errors).toEqual([]);}finally{await c.cleanup();}
});
test('size warning is reachable on mobile and never implies paid-policy generation is free',async({page})=>{
 const c=await setup(page,{policy:'paid'});try{await page.setViewportSize({width:390,height:844});await page.locator('.mobile-tabs').getByRole('button',{name:'参数',exact:true}).click();const hint=page.getByLabel('尺寸费用提示').filter({visible:true});await expect(hint).toContainText('当前按 Anlas 付费规则计算');await page.getByLabel('宽度',{exact:true}).fill('10240');await expect(hint).toContainText('4096 × 1024');await hint.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:evidence+'/fee-mobile.png'});expect(c.errors).toEqual([]);}finally{await c.cleanup();}
});
