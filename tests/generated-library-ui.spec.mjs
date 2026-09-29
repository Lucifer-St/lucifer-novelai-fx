import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {unzipSync} from 'fflate';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
test('generated library searches, annotates, compares arbitrary images, exports safely and restores actual seed',async({page})=>{
 const items=[1,2].map(i=>({result_id:`179029000000${i}-0000000${i}`,image_index:0,prompt:`garden ${i}`,final_prompt:`garden ${i}`,seed:40+i,model:'nai-diffusion-4-5-full',mode:'generate',created_at:'2026-09-25T00:00:00Z',filename:`fixture-${i}.png`,hasFile:true,url:`/api/results/fixture-${i}.png`,favorite:false,tags:[],metadata:{steps:20+i}}));
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(version=>{localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');},RELEASE_NOTES.version);
 await page.route('**/api/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;if(r.method()!=='GET')writes.push(p);
  if(p.startsWith('/api/results/fixture-')||p==='/api/share-image')return route.fulfill({body:png,contentType:'image/png'});
  if(p==='/api/results/recipe.json')return route.fulfill({json:{model:'nai-diffusion-4-5-full',novelai:{endpoint:'/ai/generate-image',body:{model:'nai-diffusion-4-5-full',action:'generate',input:'garden restored',parameters:{seed:999,width:832,height:1216,steps:28,scale:7,n_samples:1}}}}});
  if(p==='/api/generated-library/item'){const item=items.find(x=>x.result_id===u.searchParams.get('id'));return route.fulfill({json:{...item,entry:{id:item.result_id,requestUrl:'/api/results/recipe.json',images:[{url:item.url}]}}});}
  if(p==='/api/generated-library/annotation'){const body=r.postDataJSON(),item=items.find(x=>x.result_id===body.id);Object.assign(item,{...body,favorite:body.favorite??item.favorite,tags:body.tags??item.tags});return route.fulfill({json:{favorite:item.favorite,tags:item.tags}});}
  if(p==='/api/generated-library/annotations')return route.fulfill({json:{format:'lucifer-generated-library-annotations',version:1,items:Object.fromEntries(items.map(i=>[`${i.result_id}:0`,{favorite:i.favorite,tags:i.tags}]))}});
  if(p==='/api/generated-library')return route.fulfill({json:{items:items.filter(i=>(!u.searchParams.get('q')||i.prompt.includes(u.searchParams.get('q')))&&(!u.searchParams.get('favorite')||i.favorite)),nextCursor:null,index:{indexed:2,running:false}}});
  const fixtures={'/api/generated-library/groups':{groups:[]},'/api/generated-library/cleanup/settings':{maxImages:0},'/api/generated-library/cleanup/trash':{entries:[]},'/api/status':{keyConfigured:true,app:'Lucifer NovelAI FX',generationJobs:true},'/api/settings':{tutorialComplete:true,beginner:false},'/api/history':{entries:[]},'/api/anlas':{pricingPolicy:'opus',calibrations:[]},'/api/comparisons':{entries:[],active:null},'/api/library':{entries:[]},'/api/library/categories':{categories:[]},'/api/generated-library/status':{indexed:2,running:false}};
  return fixtures[p]?route.fulfill({json:fixtures[p]}):route.fulfill({status:418,json:{error:{message:'Unexpected '+p}}});
 });
 await page.goto('/');await page.getByRole('button',{name:'搜索图库',exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成图库',exact:true}),cards=dialog.locator('.generated-library-card');await expect(cards).toHaveCount(2);
 await dialog.getByLabel('图库搜索',{exact:true}).fill('garden');await dialog.getByRole('button',{name:'搜索',exact:true}).click();await expect(cards).toHaveCount(2);
 await cards.nth(0).getByRole('button',{name:'收藏',exact:true}).click();await expect(cards.nth(0).getByRole('button',{name:'取消收藏',exact:true})).toBeVisible();await cards.nth(0).getByLabel('手工标签 fixture-1.png',{exact:true}).fill('favorite scene');await cards.nth(0).getByLabel('手工标签 fixture-1.png',{exact:true}).press('Enter');
 await cards.nth(0).getByRole('button',{name:'对比',exact:true}).click();await cards.nth(1).getByRole('button',{name:'对比',exact:true}).click();await expect(dialog.getByText('两图对照',{exact:true})).toBeVisible();await expect(dialog.locator('.generated-library-differences')).toContainText('seed');
 await cards.nth(0).getByLabel('选择',{exact:true}).check();const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'批量导出 ZIP',exact:true}).click();const download=await downloadPromise,files=unzipSync(await readFile(await download.path()));const manifest=JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));expect(manifest.images[0].metadata).toBe('strip');expect(JSON.stringify(manifest)).not.toContain('garden');
 await mkdir('.local/update-1.5.0/screens',{recursive:true});await page.screenshot({path:'.local/update-1.5.0/screens/generated-library.png'});
 await page.setViewportSize({width:390,height:844});expect(await dialog.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await cards.nth(0).getByRole('button',{name:'回填',exact:true}).click();await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('garden restored');await expect(page.getByLabel('随机种子 Seed',{exact:true})).toHaveValue('41');expect(writes.every(p=>p==='/api/generated-library/annotation')).toBe(true);expect(errors).toEqual([]);
});
