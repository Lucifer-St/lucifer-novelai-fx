import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
import {APPEARANCE_KEY} from '../src/lib/loading-skins.mjs';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';

async function setup(page){
 const art=[],writes=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/assets/themes/teresa/'))art.push(new URL(request.url()).pathname)});
 await page.addInitScript(({state,key,version})=>{
  localStorage.setItem('lucifer-tag-suggestions-v1','off');
  localStorage.setItem('lucifer-share-release-seen-v1',version);
  localStorage.setItem('lucifer-share-setup-seen-v1','true');
  localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));
  localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:'classic',loadingSkin:'classic',motion:'off',characterDecorations:true}));
 },{state:{...defaults(),prompt:'keep Teresa prompt',negative:'keep negative',characters:[{id:'role-1',prompt:'keep role',negative:'',x:.5,y:.5,enabled:true}]},key:APPEARANCE_KEY,version:RELEASE_NOTES.version});
 await page.route('**/api/**',route=>{const pathname=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')writes.push(pathname);return route.fulfill({json:pathname==='/api/status'?{keyConfigured:true}:pathname==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:pathname==='/api/anlas'?{pricingPolicy:'opus',calibrations:[],sessionTotal:0}:{entries:[]}})});
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.getByLabel('正面提示词',{exact:true})).toBeVisible();
 return {art,writes,errors};
}

test('Teresa loads art only when selected and preserves live prompt and role state',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const ctx=await setup(page);expect(ctx.art).toEqual([]);
 await page.getByRole('tab',{name:/角色/}).click();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toHaveValue('keep role');await page.getByRole('tab',{name:'提示词',exact:true}).click();
 await page.getByLabel('皮肤与加载画面',{exact:true}).click();await page.getByRole('radio',{name:'Teresa · 特蕾莎',exact:true}).check();await page.getByLabel('关闭功能面板',{exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-workbench-skin','teresa');await expect(page.locator('.app')).toHaveAttribute('data-character-ui','on');
 await expect(page.locator('.teresa-prompt-header')).toBeVisible();await expect(page.locator('.teresa-inspector-art:not(.is-compact)')).toBeVisible();
 await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('keep Teresa prompt');
 await expect.poll(()=>ctx.art).toEqual(expect.arrayContaining(['/assets/themes/teresa/letter-ornament.svg','/assets/themes/teresa/wide.png','/assets/themes/teresa/chibi.png']));
 await mkdir('.local/teresa-theme',{recursive:true});await page.screenshot({path:'.local/teresa-theme/desktop-1440.png',fullPage:true});
 await page.getByLabel('皮肤与加载画面',{exact:true}).click();await page.getByLabel('角色装饰',{exact:true}).uncheck();await page.getByLabel('关闭功能面板',{exact:true}).click();await expect(page.locator('.app')).toHaveAttribute('data-character-ui','off');
 await page.getByRole('tab',{name:/角色/}).click();await expect(page.getByLabel('角色 1 正面提示词',{exact:true})).toHaveValue('keep role');
 expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});

test('Teresa artwork keeps its source proportions at custom, collapsed and mobile widths',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.addInitScript(({state,key,version})=>{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:'teresa',loadingSkin:'classic',motion:'off',characterDecorations:true}));},{state:{...defaults(),prompt:'keep layout'},key:APPEARANCE_KEY,version:RELEASE_NOTES.version});
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/status'?{keyConfigured:true}:{entries:[]}}));await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('.teresa-inspector-art:not(.is-compact)')).toBeVisible();
 for(const width of [240,296]){
  const handle=page.getByRole('separator',{name:'调整图片与右侧栏宽度'}),h=await handle.boundingBox(),panel=await page.locator('.right-panel').boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+50);await page.mouse.down();await page.mouse.move(h.x+h.width/2+panel.width-width,h.y+50,{steps:5});await page.mouse.up();
  const ratio=await page.locator('.teresa-inspector-art:not(.is-compact)').evaluate(el=>{const box=el.getBoundingClientRect(),img=el.querySelector('img');return{box:box.width/box.height,source:img.naturalWidth/img.naturalHeight,overflow:el.scrollWidth-el.clientWidth}});expect(ratio.box).toBeCloseTo(ratio.source,2);expect(ratio.overflow).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);
 }
 await page.getByLabel('收起参数面板',{exact:true}).click();const compact=page.locator('.teresa-inspector-art.is-compact');await expect(compact).toBeVisible();expect(await compact.evaluate(el=>{const img=el.querySelector('img');return img.naturalWidth/img.naturalHeight})).toBeCloseTo(.5,2);expect(await compact.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);await page.evaluate(()=>scrollTo(0,0));
 await mkdir('.local/teresa-theme',{recursive:true});await page.screenshot({path:'.local/teresa-theme/collapsed-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.teresa-mobile-banner')).toBeVisible();await expect(page.locator('.teresa-prompt-header')).toHaveCount(1);await expect(page.locator('.teresa-inspector-art.is-compact')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.screenshot({path:'.local/teresa-theme/mobile-390.png',fullPage:true});
});
