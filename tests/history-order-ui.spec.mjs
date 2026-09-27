import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
const entry=n=>({id:`${1790000000000+n*1000}-fixture`,createdAt:new Date(1790000000000+n*1000).toISOString(),prompt:`History ${n}`,status:'success',images:[{url:image}]});
async function setup(page){
 let latest=200,historyCalls=0,job=null;const writes=[],errors=[];
 await page.addInitScript(s=>{localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-tag-suggestions-v1','off');localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state:s}));},{...defaults(),prompt:'synthetic history regression',seed:42});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{const req=r.request(),p=new URL(req.url()).pathname;const send=x=>r.fulfill({json:x});if(req.method()!=='GET')writes.push(p);
  if(p==='/api/settings')return send({provider:'native',keyConfigured:true,beginner:false,tutorialComplete:true});
  if(p==='/api/status')return send({keyConfigured:true,generationJobs:true,generationBusy:false});
  if(p==='/api/models')return send({data:[{id:'nai-diffusion-5-full'}]});
  if(p==='/api/history'){historyCalls++;return send({entries:Array.from({length:200},(_,i)=>entry(latest-i))});}
  if(p==='/api/anlas')return send({pricingPolicy:'opus',calibrations:[]});if(p==='/api/library')return send({entries:[]});if(p==='/api/comparisons')return send({entries:[],active:null});
  if(p==='/api/generation-jobs'&&req.method()==='POST'){const body=req.postDataJSON();latest++;job={id:body.clientRequestId,status:'success',createdAt:new Date().toISOString(),result:entry(latest)};return send({...job,status:'running',phase:'waiting_result',timeoutMs:600000});}
  if(p.startsWith('/api/generation-jobs/'))return send(job);
  return r.fulfill({status:418,json:{error:{message:'Unexpected '+p}}});
 });await page.goto('/');await expect(page.locator('.history-item')).toHaveCount(200);return{writes,errors,get historyCalls(){return historyCalls;}};
}
test('the 201st and later results stay leftmost after a 200-record refresh, with follow-latest scrolling',async({page})=>{
 const ctx=await setup(page),strip=page.locator('.history-strip');await strip.evaluate(el=>el.scrollLeft=650);await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 await page.locator('.generate').click();await expect.poll(()=>ctx.historyCalls).toBeGreaterThan(1);await expect(page.locator('.history-item')).toHaveCount(201);
 await expect(page.locator('.history-item').first()).toHaveAttribute('title','History 201');await expect(page.locator('.history-item.selected')).toHaveAttribute('title','History 201');await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBe(0);
 await page.locator('.generate').click();await expect(page.locator('.history-item')).toHaveCount(202);await expect(page.locator('.history-item').first()).toHaveAttribute('title','History 202');
 const before=ctx.historyCalls;await page.getByRole('button',{name:'刷新历史记录',exact:true}).click();await expect.poll(()=>ctx.historyCalls).toBeGreaterThan(before);await expect(page.locator('.history-item').first()).toHaveAttribute('title','History 202');await expect(page.locator('.history-item')).toHaveCount(202);
 await mkdir('.local/history-qa',{recursive:true});await page.screenshot({path:'.local/history-qa/newest-first.png'});expect(ctx.writes).toEqual(['/api/generation-jobs','/api/generation-jobs']);expect(ctx.errors).toEqual([]);
});
test('refreshing an over-limit collection never steals an older selected image',async({page})=>{
 const ctx=await setup(page);await page.locator('.generate').click();await expect(page.locator('.history-item')).toHaveCount(201);
 await page.locator('.history-item[title="History 190"]').click();await expect(page.locator('.history-item.selected')).toHaveAttribute('title','History 190');const scroll=await page.locator('.history-strip').evaluate(el=>el.scrollLeft);const before=ctx.historyCalls;
 await page.getByRole('button',{name:'刷新历史记录',exact:true}).click();await expect.poll(()=>ctx.historyCalls).toBeGreaterThan(before);await expect(page.locator('.history-item.selected')).toHaveAttribute('title','History 190');await expect(page.locator('.history-item').first()).toHaveAttribute('title','History 201');expect(await page.locator('.history-strip').evaluate(el=>el.scrollLeft)).toBe(scroll);expect(ctx.errors).toEqual([]);
});
test('history collapse preserves selection and scroll, persists across reload, and makes no write',async({page})=>{
 const ctx=await setup(page),strip=page.locator('.history-strip');await page.locator('.history-item[title="History 190"]').click();const scroll=await strip.evaluate(el=>el.scrollLeft);
 await page.getByRole('button',{name:'收起历史记录',exact:true}).click();await expect(strip).toBeHidden();await expect(page.locator('.history-item')).toHaveCount(200);
 await page.getByRole('button',{name:'展开历史记录',exact:true}).click();await expect(page.locator('.history-item.selected')).toHaveAttribute('title','History 190');expect(await strip.evaluate(el=>el.scrollLeft)).toBe(scroll);
 await page.getByRole('button',{name:'收起历史记录',exact:true}).click();await page.reload();await expect(strip).toBeHidden();expect(ctx.writes).toEqual([]);expect(ctx.errors).toEqual([]);
});
test('older history can be loaded after refresh and remains selected on a later refresh',async({page})=>{
 const ctx=await setup(page);const older=Array.from({length:5},(_,i)=>entry(-i));
 await page.route('**/api/history*',route=>{const before=new URL(route.request().url()).searchParams.get('before');return route.fulfill({json:before?{entries:older,nextCursor:null}:{entries:Array.from({length:200},(_,i)=>entry(200-i)),nextCursor:entry(1).id}});});
 await page.getByRole('button',{name:'刷新历史记录',exact:true}).click();
 await expect(page.getByRole('button',{name:'加载更早记录'})).toBeVisible();
 await page.getByRole('button',{name:'加载更早记录'}).click();
 await expect(page.locator('.history-item')).toHaveCount(205);
 await page.locator('.history-item[title="History -4"]').click();
 await page.getByRole('button',{name:'刷新历史记录',exact:true}).click();
 await expect(page.locator('.history-item.selected')).toHaveAttribute('title','History -4');
 expect(ctx.errors).toEqual([]);
});

// These established flows exercise the workbench after the version notice is read.
test.beforeEach(async({page})=>{await page.addInitScript(version=>{try{localStorage.setItem('lucifer-share-release-seen-v1',version);}catch{}},RELEASE_NOTES.version);});
