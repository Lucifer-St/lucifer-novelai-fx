import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {test,expect} from '@playwright/test';
import {defaults} from '../src/lib/request.mjs';
import {mkdir} from 'node:fs/promises';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
const old={id:'old',createdAt:'2026-09-21T00:00:00Z',prompt:'previous garden',images:[{url:PNG}]};
const evidence='.local/panels-qa';
async function setup(page,{n=3,steps=25}={}){
 const calls=[],errors=[];let job=null;
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(s=>{localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-tag-suggestions-v1','off');if(!localStorage.getItem('novelai-studio-v1'))localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state:s}));},{...defaults(),prompt:'a quiet lake',seed:42,n,steps});
 await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname,method=route.request().method(),body=route.request().postDataJSON()||{};calls.push({p,method,body});const send=x=>route.fulfill({json:x});
  if(p==='/api/settings')return send({provider:'native',keyConfigured:true,beginner:false,tutorialComplete:true});
  if(p==='/api/status')return send({keyConfigured:true,generationJobs:true,opusBatch:true,generationBusy:!!job&&['queued','running','stopping'].includes(job.status),activeGeneration:job&&['queued','running','stopping'].includes(job.status)?{id:job.id,status:job.status}:null});
  if(p==='/api/models')return send({data:[{id:'nai-diffusion-5-full'}]});
  if(p==='/api/history')return send({entries:[...(job?.batch.items.flatMap(i=>i.result?[i.result]:[])||[]),old]});
  if(p==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[]});if(p==='/api/library')return send({entries:[]});
  if(p==='/api/comparisons')return send({entries:[],active:null});
  if(p==='/api/generation-jobs'&&method==='POST'){
   expect(body.opusBatch).toBe(true);job={id:body.clientRequestId,status:'running',phase:'waiting_result',createdAt:new Date().toISOString(),width:832,height:1216,timeoutMs:600000,receivedBytes:0,batch:{mode:'opus-single',items:Array.from({length:n},(_,index)=>({index,seed:42+index,status:index===0?'running':'queued'}))}};return send(job);
  }
  if(p.startsWith('/api/generation-jobs/')){if(p.endsWith('/stop')){job.status='stopped';job.batch.items.forEach(i=>{if(i.status!=='success')i.status='not_submitted';});}return job?send(job):route.fulfill({status:404,json:{error:{message:'missing'}}});}
  return route.fulfill({status:418,json:{error:{message:'Unexpected '+p}}});
 });await page.goto('/');await expect(page.getByLabel('正面提示词',{exact:true})).toBeEditable();await mkdir(evidence,{recursive:true});
 return {calls,errors,get job(){return job;},finish(index){const item=job.batch.items[index];item.status='success';item.result={...old,id:'sample-'+index,prompt:'sample '+index,createdAt:new Date().toISOString()};if(job.batch.items[index+1])job.batch.items[index+1].status='running';else job.status='success';}};
}
const width=locator=>locator.evaluate(el=>el.getBoundingClientRect().width);
async function drag(page,label,dx){const handle=page.getByRole('separator',{name:label,exact:true}),box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+120);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+120,{steps:8});await page.mouse.up();}
test('batch fills slots incrementally, refresh never resubmits and completion preserves chosen image',async({page},info)=>{
 const ctx=await setup(page);await page.getByLabel('Opus 0 Anlas 模式（多图限定）',{exact:true}).check();await page.locator('.generate').click();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toContainText('0/3');await expect(page.getByRole('button',{name:'关闭逐张生成结果',exact:true})).toHaveCount(0);ctx.finish(0);await expect(page.getByRole('button',{name:'第 1 张 · 已完成',exact:true})).toBeEnabled();
 await page.reload();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toContainText('1/3');await page.getByRole('button',{name:'第 1 张 · 已完成',exact:true}).click();ctx.finish(1);ctx.finish(2);await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toContainText('3/3');await expect(page.getByRole('button',{name:'第 1 张 · 已完成',exact:true})).toHaveClass('selected');await expect(page.locator('.generate')).toBeEnabled();
 await page.screenshot({path:`${evidence}/${info.project.name||'classic'}-batch-complete.png`});await page.reload();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toContainText('3/3');expect(ctx.calls.filter(c=>c.p==='/api/generation-jobs'&&c.method==='POST')).toHaveLength(1);expect(ctx.calls.some(c=>c.p==='/api/request')).toBe(false);expect(ctx.errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-tabs').getByRole('button',{name:'画布',exact:true}).click();await page.getByRole('region',{name:'逐张生成结果',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${evidence}/${info.project.name||'classic'}-batch-mobile-close.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.getByRole('button',{name:'第 2 张 · 已完成',exact:true}).click();await page.getByRole('button',{name:'关闭逐张生成结果',exact:true}).click();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toHaveCount(0);await expect(page.getByAltText('生成结果 1')).toBeVisible();await expect(page.locator('.history-item')).toHaveCount(4);expect(await page.evaluate(()=>localStorage.getItem('lucifer-last-opus-batch-v1'))).toBeNull();
 const reads=ctx.calls.filter(c=>c.p.startsWith('/api/generation-jobs/')&&c.method==='GET').length;await page.reload();await expect(page.locator('.history-item')).toHaveCount(4);await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toHaveCount(0);expect(ctx.calls.filter(c=>c.p.startsWith('/api/generation-jobs/')&&c.method==='GET')).toHaveLength(reads);expect(ctx.calls.filter(c=>c.method!=='GET')).toHaveLength(1);expect(ctx.errors).toEqual([]);
});
test('batch stop leaves completed slots available and out-of-limit parameters never submit',async({page})=>{
 const ctx=await setup(page);await page.getByLabel('Opus 0 Anlas 模式（多图限定）',{exact:true}).check();await page.locator('.generate').click();ctx.finish(0);await expect(page.getByRole('button',{name:'第 1 张 · 已完成',exact:true})).toBeEnabled();await page.getByRole('button',{name:'停止后续图片',exact:true}).click();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toContainText('已停止后续任务');await page.getByRole('button',{name:'第 1 张 · 已完成',exact:true}).click();await expect(page.getByAltText('生成结果 1')).toBeVisible();expect(ctx.calls.filter(c=>c.p==='/api/generation-jobs'&&c.method==='POST')).toHaveLength(1);expect(ctx.errors).toEqual([]);
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('novelai-studio-v1'));s.state.steps=29;localStorage.setItem('novelai-studio-v1',JSON.stringify(s));});await page.reload();await page.locator('.generate').click();await expect(page.getByRole('alert')).toContainText('步数超过 28');expect(ctx.calls.filter(c=>c.p==='/api/generation-jobs'&&c.method==='POST')).toHaveLength(1);
 await page.getByRole('button',{name:'关闭逐张生成结果',exact:true}).click();await expect(page.getByRole('region',{name:'逐张生成结果',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('lucifer-last-opus-batch-v1'))).toBeNull();await expect(page.locator('.history-item')).toHaveCount(2);expect(ctx.calls.filter(c=>c.method!=='GET')).toHaveLength(2);
});

test('right inspector content fits default and resized widths without clipping or horizontal scroll',async({page},info)=>{
 const ctx=await setup(page);
 const check=async()=>{
  const measured=await page.locator('.inspector-settings-content').evaluate(panel=>{
   panel.scrollLeft=0;const rect=panel.getBoundingClientRect(),right=rect.left+panel.clientWidth;
   return {client:panel.clientWidth,scroll:panel.scrollWidth,overflow:getComputedStyle(panel).overflowX,outside:[...panel.querySelectorAll('input,select,button,.theme-inspector-art,.teresa-bookmark')].filter(el=>{const b=el.getBoundingClientRect();return b.width&&b.height&&(b.right>right+1||b.left<rect.left-1);}).map(el=>({tag:el.tagName,cls:el.className,label:el.getAttribute('aria-label')||el.textContent?.slice(0,40)}))};
  });
  expect(measured.scroll,JSON.stringify(measured)).toBeLessThanOrEqual(measured.client);
  expect(measured.outside,JSON.stringify(measured)).toEqual([]);
  expect(['hidden','clip']).not.toContain(measured.overflow);
 };
 // Reserve a real vertical scrollbar gutter, including headless overlay-scrollbar hosts.
 await expect(page.getByLabel('Opus 0 Anlas 模式（多图限定）',{exact:true})).toBeVisible();
 for(const viewport of [1716,1024]){await page.setViewportSize({width:viewport,height:1100});await check();}
 await page.getByLabel('开启 A/B/C 对照').check();
 await page.setViewportSize({width:1440,height:1000});await drag(page,'调整图片与右侧栏宽度',900);await check();
 await page.getByLabel('随机种子 Seed',{exact:true}).fill('4294967295');
 await page.getByLabel('恢复随机种子（-1）',{exact:true}).click();await expect(page.getByLabel('随机种子 Seed',{exact:true})).toHaveValue('-1');
 await drag(page,'调整图片与右侧栏宽度',-200);await check();
 await page.getByRole('button',{name:'恢复布局',exact:true}).click();await check();
 await page.setViewportSize({width:1716,height:1324});await page.locator('.inspector-settings-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${evidence}/${info.project.name||'classic'}-inspector-fits.png`});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'参数',exact:true}).click();await check();expect(ctx.errors).toEqual([]);expect(ctx.calls.filter(c=>c.method==='POST')).toHaveLength(0);
});

// These established flows exercise the workbench after the version notice is read.
test.beforeEach(async({page})=>{await page.addInitScript(version=>{try{localStorage.setItem('lucifer-share-release-seen-v1',version);}catch{}},RELEASE_NOTES.version);});
