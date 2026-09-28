import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import pkg from '../package.json' with {type:'json'};
import {defaults} from '../src/lib/request.mjs';
const skins=[['exstia','ExS-TiA','光の翼よ、闇を裂け'],['exstia-chevalier','ExS-TiA Chevalier','王家の剣に誓って'],['exstia-magica','ExS-TiA Magica','雷光よ、四方を穿て']];
async function setup(page,skin='classic',mode='classic'){
 const errors=[],art=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/themes/exstia/'))art.push(r.url());});
 await page.addInitScript(({skin,mode,version,state})=>{
  localStorage.setItem('lucifer-share-release-seen-v1',version);localStorage.setItem('lucifer-share-auto-update-check-v1','off');localStorage.setItem('lucifer-share-setup-seen-v1','true');localStorage.setItem('lucifer-tag-suggestions-v1','off');
  localStorage.setItem('novelai-studio-v1',JSON.stringify({version:1,state}));localStorage.setItem('lucifer-fx-appearance-v1',JSON.stringify({version:1,workbenchSkin:skin,loadingSkin:'random',motion:'off'}));localStorage.setItem('lucifer-prompt-layout-v1',JSON.stringify({version:1,mode}));
 },{skin,mode,version:pkg.version,state:{...defaults(),prompt:'0.7::soft light::, 1.15::morning mist::, pine forest',negative:'.5::blur::',seed:42}});
 await page.route('**/api/**',route=>{const r=route.request(),p=new URL(r.url()).pathname;if(r.method()!=='GET')writes.push(p);const value=p==='/api/status'?{keyConfigured:true,generationJobs:true}:p==='/api/settings'?{tutorialComplete:true,beginner:false}:p==='/api/models'?{data:[{id:'nai-diffusion-5-full'},{id:'nai-diffusion-4-5-full'}]}:p==='/api/anlas'?{entries:[],calibrations:[],pricingPolicy:'opus'}:{entries:[]};return route.fulfill({json:value});});
 await page.goto('/');await page.getByLabel('正面提示词',{exact:true}).waitFor();return {errors,art,writes};
}
test('native skin picker retains textarea identity, selection, loading choice and classic remains lazy',async({page})=>{
 const ctx=await setup(page);expect(ctx.art).toEqual([]);await page.evaluate(()=>{window.exstiaEditor=document.querySelector('#positive');window.exstiaEditor.setSelectionRange(3,8)});
 for(const [id,name] of skins){await page.getByLabel('皮肤与加载画面',{exact:true}).click();await page.getByRole('radio',{name,exact:true}).check();await page.getByLabel('关闭功能面板',{exact:true}).click();await expect(page.locator('.app')).toHaveAttribute('data-workbench-skin',id);expect(await page.evaluate(()=>window.exstiaEditor===document.querySelector('#positive'))).toBe(true);expect(await page.getByLabel('正面提示词',{exact:true}).evaluate(e=>[e.selectionStart,e.selectionEnd])).toEqual([3,8]);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('lucifer-fx-appearance-v1')).loadingSkin)).toBe('random');}
 expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});
for(const [skin,,quote] of skins)for(const mode of ['classic','merged'])test(`${skin} ${mode}: weights, model, cards, responsive art and independent inspector widths`,async({page})=>{
 await page.setViewportSize({width:1700,height:1200});const ctx=await setup(page,skin,mode),prompt=page.getByLabel('正面提示词',{exact:true});
 await expect(page.locator('.app')).toHaveClass(/exstia-workbench/);await expect(page.locator('.exstia-hero .exstia-quote')).toHaveText(quote);await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.inspector-heading .exstia-companion')).toBeVisible();expect((await page.locator('.inspector-heading .exstia-companion').boundingBox()).height).toBeGreaterThan(150);await expect(page.locator('.exstia-hero .exstia-quote-main')).toHaveCSS('font-size',skin==='exstia-chevalier'?'16px':'27px');
 await expect(prompt).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(page.locator('#positive-panel .prompt-weight-weak').first()).toBeVisible();
 await prompt.press('End');await prompt.press('X');await prompt.press('Control+z');await expect(prompt).toHaveValue('0.7::soft light::, 1.15::morning mist::, pine forest');
 await page.getByLabel('图像模型',{exact:true}).selectOption('nai-diffusion-4-5-full');await page.getByLabel('图像模型',{exact:true}).selectOption('nai-diffusion-5-full');
 if(mode==='classic')await page.getByRole('tab',{name:'负面 Undesired Content',exact:true}).click();await expect(page.getByLabel('负面提示词',{exact:true})).toHaveCSS('background-color','rgba(0, 0, 0, 0)');if(mode==='classic')await page.getByRole('tab',{name:'正面 Prompt',exact:true}).click();
 await page.getByRole('button',{name:'添加卡片',exact:true}).first().click();await expect(page.getByRole('region',{name:'快捷卡片'})).toBeVisible();await page.getByRole('button',{name:'关闭快捷卡片',exact:true}).click();
 for(const width of [240,296,440]){const handle=page.getByRole('separator',{name:'调整图片与右侧栏宽度'}),r=await handle.boundingBox(),p=await page.locator('.right-panel').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+50);await page.mouse.down();await page.mouse.move(r.x+r.width/2+p.width-width,r.y+50,{steps:5});await page.mouse.up();expect(await page.locator('.exstia-side-wide image').evaluate(el=>{const m=el.getScreenCTM();return Math.abs(m.a-m.d)})).toBeLessThan(.001);}
 await page.getByLabel('收起参数面板',{exact:true}).click();await expect(page.locator('.exstia-side-compact')).toBeVisible();await page.getByLabel('展开参数面板',{exact:true}).click();await page.getByRole('button',{name:'恢复布局',exact:true}).click();
 await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.exstia-portrait image')].map(e=>{const i=new Image();i.src=e.getAttribute('href');return i.decode()})));
 await mkdir('.local/exstia-qa',{recursive:true});await page.screenshot({path:`.local/exstia-qa/${skin}-${mode}-desktop.png`});
 await page.setViewportSize({width:1440,height:900});await expect(page.getByLabel('图像模型',{exact:true})).toBeInViewport();await page.screenshot({path:`.local/exstia-qa/${skin}-${mode}-short.png`});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.exstia-mobile-quote')).toHaveText(quote);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:`.local/exstia-qa/${skin}-${mode}-mobile.png`,fullPage:true});expect(ctx.errors).toEqual([]);expect(ctx.writes).toEqual([]);
});
