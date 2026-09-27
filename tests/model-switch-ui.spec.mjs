import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {defaults} from '../src/lib/request.mjs';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMhcAAAAASUVORK5CYII=','base64');
async function setup(page,state={}){
 const writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state,version})=>{if(!localStorage.getItem('novelai-studio-v1'))localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-setup-seen-v1','true');},{state:{...defaults(),prompt:'a garden',...state},version:RELEASE_NOTES.version});
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')writes.push({path:url.pathname,body:request.postDataJSON()});
  const fixtures={'/api/status':{keyConfigured:true,app:'Lucifer NovelAI FX',generationJobs:true},'/api/settings':{tutorialComplete:true,beginner:false},'/api/history':{entries:[]},'/api/anlas':{pricingPolicy:'opus',calibrations:[]},'/api/comparisons':{entries:[],active:null},'/api/library':{entries:[]},'/api/library/categories':{categories:[]},'/api/generated-library':{items:[],nextCursor:null,index:{running:false,scanned:0,total:0}},'/api/generated-library/status':{running:false,scanned:0,total:0}};
  if(fixtures[url.pathname])return route.fulfill({json:fixtures[url.pathname]});return route.fulfill({status:418,json:{error:{message:'Unexpected fixture endpoint '+url.pathname}}});
 });await page.goto('/');await expect(page.getByLabel('正面提示词',{exact:true})).toBeEditable();return {writes,errors};
}
test('V4.5 references are separate, can be disabled and survive reload without changing generation mode',async({page})=>{
 const ctx=await setup(page);await page.getByLabel('图像模型',{exact:true}).selectOption('nai-diffusion-4-5-full');await page.getByRole('group',{name:'V4.5 设置栏目'}).getByRole('button',{name:'参考图',exact:true}).click();await expect(page.getByLabel('V4.5 参考图',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Precise Reference',exact:true}).click();await page.getByRole('button',{name:'添加参考图',exact:true}).click();await page.locator('.reference-card input[type=file]').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:png});await expect(page.locator('.reference-card .image-preview img')).toBeVisible();
 await expect(page.getByRole('button',{name:'文生图',exact:true})).toHaveAttribute('aria-pressed','true');expect(ctx.writes).toEqual([]);
 await page.getByRole('group',{name:'参考图模式'}).getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('.reference-card')).toHaveCount(0);
 await page.getByRole('button',{name:'Precise Reference',exact:true}).click();await expect(page.locator('.reference-card .image-preview img')).toBeVisible();
 await page.getByLabel('图像模型',{exact:true}).selectOption('nai-diffusion-5-full');await expect(page.getByLabel('V4.5 参考图',{exact:true})).toHaveCount(0);await expect(page.getByLabel('正面提示词',{exact:true})).toHaveValue('a garden');
 await page.getByLabel('图像模型',{exact:true}).selectOption('nai-diffusion-4-5-full');await expect(page.locator('.reference-card .image-preview img')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('lucifer-reference-drafts-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get('models');q.onsuccess=()=>{db.close();resolve(!!q.result?.['nai-diffusion-4-5-full']?.precise?.[0]?.image);};};}))).toBe(true);
 await page.reload();await page.getByRole('group',{name:'V4.5 设置栏目'}).getByRole('button',{name:'参考图',exact:true}).click();await expect(page.getByLabel('图像模型',{exact:true})).toHaveValue('nai-diffusion-4-5-full');await expect(page.locator('.reference-card .image-preview img')).toBeVisible();expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
 await mkdir('.local/update-1.5.0/screens',{recursive:true});await page.screenshot({path:'.local/update-1.5.0/screens/v45-reference.png'});
});
test('image workflow always has an exit and removing the source returns to text generation',async({page})=>{
 const ctx=await setup(page,{model:'nai-diffusion-4-5-curated'});await page.getByRole('button',{name:'图生图',exact:true}).click();
 await expect(page.getByRole('button',{name:/退出图生图/})).toBeVisible();await page.getByRole('button',{name:/退出图生图/}).click();await expect(page.getByRole('button',{name:'文生图',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'图生图',exact:true}).click();await page.locator('.canvas .image-input input[type=file]').setInputFiles({name:'source.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:/移除.*输入|移除.*源图/}).click();await expect(page.getByRole('button',{name:'文生图',exact:true})).toHaveAttribute('aria-pressed','true');expect(ctx.writes).toEqual([]);
});
test('real bundled Chinese suggestions, V5 text and generated library entry stay usable at laptop width',async({page})=>{
 const ctx=await setup(page);await page.setViewportSize({width:1280,height:720});const prompt=page.getByLabel('正面提示词',{exact:true});await prompt.fill('长发');await prompt.press('ArrowLeft');await prompt.press('ArrowRight');await expect(page.locator('.tag-option').filter({has:page.locator('strong').getByText('long hair',{exact:true})})).toBeVisible();
 await page.getByText('画面文字 · V5',{exact:true}).click();await page.getByLabel('需要画在图中的文字',{exact:true}).fill('你好');await page.getByRole('button',{name:'查看完整请求 JSON',exact:true}).click();await expect(page.locator('.json-dialog pre')).toContainText('Text: 你好');await page.getByRole('button',{name:'关闭 JSON',exact:true}).click();
 await page.getByRole('button',{name:'搜索图库',exact:true}).click();await expect(page.getByRole('dialog',{name:'生成图库',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1280);expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});
