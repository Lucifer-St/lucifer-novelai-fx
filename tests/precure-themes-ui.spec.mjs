import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {APPEARANCE_KEY} from '../src/lib/loading-skins.mjs';
const skins=[['precure-scrapbook','找出‘真实’的答案'],['precure-days','名探偵の道も一歩から']];
async function setup(page){
 const art=[],writes=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/themes/precure/'))art.push(r.url())});
 await page.addInitScript(({state,key})=>{localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem(key,JSON.stringify({version:1,workbenchSkin:'classic',loadingSkin:'random',motion:'off',characterDecorations:false}));},{state:{...defaults(),prompt:'0.7::soft light::, blue sky',negative:'blur',seed:42},key:APPEARANCE_KEY});
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')writes.push(p);return r.fulfill({json:p==='/api/status'?{keyConfigured:true}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:p==='/api/anlas'?{pricingPolicy:'opus',calibrations:[],sessionTotal:0}:{entries:[]}})});
 await page.goto('/');return {art,writes,errors};
}
test('approved Precure choices stay local, preserve editing and loading preference, and load no art in classic',async({page},info)=>{
 test.skip(info.project.name&&info.project.name!=='classic','This picker transition is independent of the initial project skin.');
 const ctx=await setup(page);await expect(page.getByLabel('正面提示词',{exact:true})).toBeVisible();expect(ctx.art).toEqual([]);
 await page.locator('.prompt-editor').evaluate(el=>el.style.height='615px');await page.getByLabel('正面提示词',{exact:true}).evaluate(el=>el.setSelectionRange(3,9));
 for(const [id,name] of skins){
  await page.getByLabel('皮肤与加载画面',{exact:true}).click();await page.getByRole('radio',{name,exact:true}).check();await page.getByLabel('关闭功能面板').click();
  await expect(page.locator('.app')).toHaveAttribute('data-workbench-skin',id);await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('0.7::soft light::, blue sky');
  expect(await page.locator('.prompt-editor').evaluate(el=>el.style.height)).toBe('615px');expect(await page.getByLabel('正面提示词',{exact:true}).evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([3,9]);
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),APPEARANCE_KEY)).toEqual({version:1,workbenchSkin:id,loadingSkin:'random',motion:'off',characterDecorations:false});
 }
 // Remove the fixture initializer; a new page must hydrate the actual saved choice.
 const storage=await page.context().storageState();const fresh=await page.context().browser().newContext({storageState:storage,baseURL:new URL(page.url()).origin});const reopened=await fresh.newPage();await reopened.route('**/api/**',r=>r.fulfill({json:{entries:[]}}));await reopened.goto('/');await expect(reopened.locator('.app')).toHaveAttribute('data-workbench-skin','precure-days');await fresh.close();
 expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});
test('Precure portrait framing and compact/mobile switches keep native controls inside their columns',async({page},info)=>{
 const skin=info.project.name;test.skip(!skins.some(s=>s[0]===skin),'Runs for the two new theme projects.');
 await page.addInitScript(state=>{localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));},{...defaults(),prompt:'landscape',seed:42});
 await page.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/status'?{keyConfigured:true}:{entries:[]}}));
 await page.setViewportSize({width:1526,height:1030});await page.goto('/');await expect(page.locator('.precure-prompt-header')).toBeVisible();
 // The rejected implementation reduced the hero art to 76px. Protect the chosen composition.
 const header=await page.locator('.precure-prompt-header').boundingBox();expect(header.height).toBeGreaterThanOrEqual(220);expect(header.width).toBeGreaterThan(440);
 const right=await page.locator('.right-panel').boundingBox();expect(right.width).toBeGreaterThan(370);
 await expect(page.locator('.history-panel .precure-memory-photo')).toHaveCount(0);
 if(skin==='precure-days'){
  const photo=page.locator('.precure-generation-keepsake');await expect(photo).toBeVisible();
  await photo.locator('img').evaluate(img=>img.decode());await expect(photo.locator('img')).toHaveAttribute('src','/assets/themes/precure/memory.png');
  const box=await photo.boundingBox(),button=await page.locator('.generate').boundingBox();expect(box.y).toBeGreaterThan(button.y+button.height);
 }
 // Right artwork must adapt to the independently resizable inspector, not the viewport.
 for(const width of [240,296,440]){
  const handle=page.getByRole('separator',{name:'调整图片与右侧栏宽度'}),h=await handle.boundingBox(),panel=await page.locator('.right-panel').boundingBox();
  await page.mouse.move(h.x+h.width/2,h.y+50);await page.mouse.down();await page.mouse.move(h.x+h.width/2+panel.width-width,h.y+50,{steps:5});await page.mouse.up();
  const g=await page.locator('.precure-inspector-art').evaluate(el=>{const r=el.getBoundingClientRect(),s=el.querySelector('svg'),v=s.viewBox.baseVal,m=s.getScreenCTM();return {ratio:r.width/r.height,source:v.width/v.height,x:m.a,y:m.d}});
  expect(g.ratio).toBeCloseTo(g.source,2);expect(g.x).toBeCloseTo(g.y,4);
 }
 await page.getByLabel('收起参数面板',{exact:true}).click();const compact=page.locator('.precure-inspector-art.is-compact');await expect(compact).toBeVisible();expect(await compact.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.getByLabel('展开参数面板',{exact:true}).click();expect(await page.locator('.inspector-settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.precure-mobile-banner')).toBeVisible();await expect(page.locator('.precure-prompt-header')).toHaveCount(0);await expect(page.locator('.precure-inspector-art')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 const clips=await page.locator('.precure-illustration clipPath').evaluateAll(els=>els.map(el=>el.id));expect(clips.length).toBeGreaterThanOrEqual(2);expect(new Set(clips).size).toBe(clips.length);
});

test.beforeEach(async({page})=>{await page.addInitScript(version=>{try{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');}catch{}},RELEASE_NOTES.version);});
