import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
const evidence='.local/themes';
const weighted='0.7::artist:rity::, 0.5::artist:nicky_w::,\n0.7::artist:mishima_kurone::, 0.45::artist:kadokadokado::,\n1.1::year 2025, year 2026 ::, {warm light}, [soft shadows]';
async function setup(page){
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>{localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state:s}));},{...defaults(),prompt:weighted,negative:weighted,characters:[{id:'weight-role',prompt:weighted,negative:weighted,x:.5,y:.5,enabled:true}]});
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')writes.push(p);return r.fulfill({json:p==='/api/status'?{keyConfigured:true}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'}]}:p==='/api/anlas'?{pricingPolicy:'opus',calibrations:[]}:{entries:[]}})});
 await page.goto('/');await expect(page.getByLabel('正面提示词',{exact:true})).toBeVisible();await mkdir(evidence,{recursive:true});return{errors,writes};
}
async function checkPaint(input){
 await input.scrollIntoViewIfNeeded();
 // Testing token colors alone missed this regression: the editor must let them show.
 await expect(input).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const info=await input.evaluate(el=>{const m=el.parentElement.querySelector('.prompt-weight-mirror'),s=getComputedStyle(el),ms=getComputedStyle(m);return{text:el.value,mirrorText:m.textContent,fill:s.webkitTextFillColor,mirrorFill:ms.webkitTextFillColor,colors:['weak','strong','delimiter'].map(k=>getComputedStyle(m.querySelector('.prompt-weight-'+k)).backgroundColor),inputWidth:el.clientWidth,mirrorWidth:m.clientWidth,lineHeight:s.lineHeight,mirrorLineHeight:ms.lineHeight}});
 expect(info.mirrorText).toBe(info.text);expect(info.fill).not.toBe('rgba(0, 0, 0, 0)');expect(info.mirrorFill).toBe('rgba(0, 0, 0, 0)');expect(info.colors).toEqual(['rgba(100, 169, 245, 0.3)','rgba(239, 180, 88, 0.34)','rgba(98, 187, 135, 0.39)']);expect(info.mirrorWidth).toBe(info.inputWidth);expect(info.mirrorLineHeight).toBe(info.lineHeight);
}
test('weight highlights remain painted in positive, negative and character editors on desktop and mobile',async({page},testInfo)=>{
 const ctx=await setup(page);const skin=await page.locator('.app').getAttribute('data-workbench-skin');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.getByRole('tab',{name:'提示词',exact:true}).click();await page.getByRole('tab',{name:'正面 Prompt',exact:true}).click();await checkPaint(page.getByLabel('正面提示词',{exact:true}));
  await page.locator('.left-panel').screenshot({path:`${evidence}/${skin}-${width}-weights.png`});
  await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();await checkPaint(page.getByLabel('负面提示词',{exact:true}));
  await page.getByRole('tab',{name:/角色/}).click();for(const side of ['正面','负面']){await page.getByRole('tablist',{name:'角色 1 正负面提示词',exact:true}).getByRole('tab',{name:new RegExp(side)}).click();await checkPaint(page.getByLabel(`角色 1 ${side}提示词`,{exact:true}));}
  await page.locator('.character').screenshot({path:`${evidence}/${skin}-${width}-role-weights.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 }
 expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});
test('changing skin preserves manual editor height, scroll, caret, controls and active negative prompt',async({page})=>{
 const ctx=await setup(page);const editor=page.locator('.prompt-content > .prompt-editor'),positive=page.getByLabel('正面提示词',{exact:true});await positive.fill(Array(36).fill(weighted).join('\n'));
 await editor.evaluate(el=>el.style.height='620px');await positive.evaluate(el=>{el.setSelectionRange(14,25);el.scrollTop=140;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();const negative=page.getByLabel('负面提示词',{exact:true});
 const inventory=()=>page.locator('.studio button,.studio input,.studio select,.studio textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>[el.tagName,el.getAttribute('aria-label')||el.textContent.trim(),el.type||'',el.disabled]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 const before=await inventory();for(const name of ['Sacred Lineage','经典版','Sacred Lineage']){
  await page.getByLabel('皮肤与加载画面',{exact:true}).click();await page.getByRole('radio',{name,exact:true}).check();await page.getByLabel('关闭功能面板',{exact:true}).click();
  await expect(negative).toBeVisible();await expect(negative).toHaveValue(weighted);await checkPaint(negative);expect(await inventory()).toEqual(before);expect(await editor.evaluate(el=>el.style.height)).toBe('620px');
 }
 await page.getByRole('tab',{name:'正面 Prompt',exact:true}).click();expect(await positive.evaluate(el=>[el.selectionStart,el.selectionEnd,el.scrollTop])).toEqual([14,25,140]);await checkPaint(positive);
 expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});

test.beforeEach(async({page})=>{await page.addInitScript(version=>{try{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');}catch{}},RELEASE_NOTES.version);});
